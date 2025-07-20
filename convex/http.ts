import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { api, internal } from "./_generated/api";

// Rate limiting helper function
async function checkAndEnforceRateLimit(ctx: any, request: Request) {
  // Extract identifier (user ID from auth or IP address as fallback)
  let identifier = "anonymous";
  
  // Try to get user ID from authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    // In a real implementation, you'd decode the JWT token here
    // For now, we'll use IP address or a session identifier
    identifier = authHeader.substring(7); // Remove "Bearer " prefix
  }
  
  // Fallback to IP address (in production, you'd get this from request headers)
  if (identifier === "anonymous") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIP = request.headers.get("x-real-ip");
    identifier = forwardedFor || realIP || "unknown-ip";
  }

  // Check rate limit using our rate limiting mutation
  const rateLimitResult = await ctx.runMutation(api.rateLimiting.checkRateLimit, {
    identifier,
  });

  return rateLimitResult;
}


const http = httpRouter();

// RATE LIMITING: Apply rate limiting to webhook endpoints
http.route({
  path: "/lemon-squeezy-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // RATE LIMITING: Check rate limit before processing webhook
    const rateLimitResult = await checkAndEnforceRateLimit(ctx, request);
    
    if (!rateLimitResult.isAllowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: rateLimitResult.message,
          resetTime: rateLimitResult.resetTime,
        }),
        { 
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    const payloadString = await request.text();
    const signature = request.headers.get("X-Signature");

    if (!signature) {
      return new Response("Missing X-Signature header", { status: 400 });
    }

    try {
      const payload = await ctx.runAction(internal.lemonSqueezy.verifyWebhook, {
        payload: payloadString,
        signature,
      });

      if (payload.meta.event_name === "order_created") {
        const { data } = payload;

        const { success } = await ctx.runMutation(api.users.upgradeToPro, {
          email: data.attributes.user_email,
          lemonSqueezyCustomerId: data.attributes.customer_id.toString(),
          lemonSqueezyOrderId: data.id,
          amount: data.attributes.total,
        });

        if (success) {
          // optionally do anything here
        }
      }

      return new Response("Webhook processed successfully", { status: 200 });
    } catch (error) {
      console.log("Webhook error:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }),
});


// RATE LIMITING: Apply rate limiting to Clerk webhook
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // RATE LIMITING: Check rate limit before processing webhook
    const rateLimitResult = await checkAndEnforceRateLimit(ctx, request);
    
    if (!rateLimitResult.isAllowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: rateLimitResult.message,
          resetTime: rateLimitResult.resetTime,
        }),
        { 
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
    }

    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");

    if (!svix_id || !svix_signature || !svix_timestamp) {
      return new Response("Error occurred -- no svix headers", {
        status: 400,
      });
    }

    const payload = await request.json();
    const body = JSON.stringify(payload);

    const wh = new Webhook(webhookSecret);
    let evt: WebhookEvent;

    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return new Response("Error occurred", { status: 400 });
    }

    const eventType = evt.type;
    if (eventType === "user.created") {
      // save the user to convex db
      const { id, email_addresses, first_name, last_name } = evt.data;

      const email = email_addresses[0].email_address;
      const name = `${first_name || ""} ${last_name || ""}`.trim();

      try {
        await ctx.runMutation(api.users.syncUser, {
          userId: id,
          email,
          name,
        });
      } catch (error) {
        console.log("Error creating user:", error);
        return new Response("Error creating user", { status: 500 });
      }
    }

    return new Response("Webhook processed successfully", { status: 200 });
  }),
});

// RATE LIMITING: New endpoint to check rate limit status
http.route({
  path: "/rate-limit-status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // Extract identifier same way as in rate limiting check
    let identifier = "anonymous";
    
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      identifier = authHeader.substring(7);
    }
    
    if (identifier === "anonymous") {
      const forwardedFor = request.headers.get("x-forwarded-for");
      const realIP = request.headers.get("x-real-ip");
      identifier = forwardedFor || realIP || "unknown-ip";
    }

    // Get current rate limit status
    const status = await ctx.runQuery(api.rateLimiting.getRateLimitStatus, {
      identifier,
    });

    return new Response(
      JSON.stringify({
        identifier,
        requestCount: status.requestCount,
        remaining: status.remaining,
        resetTime: status.resetTime,
        dailyLimit: 10,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": status.remaining.toString(),
          "X-RateLimit-Reset": status.resetTime.toString(),
        },
      }
    );
  }),
});

export default http;