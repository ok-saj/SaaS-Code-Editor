import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// Webhook endpoint for LemonSqueezy payments (NO RATE LIMITING - webhooks need to be reliable)
http.route({
  path: "/lemon-squeezy-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
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


// Webhook endpoint for Clerk user management (NO RATE LIMITING - webhooks need to be reliable)
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
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

// RATE LIMITING: Endpoint to check rate limit status for Gemini API usage only
http.route({
  path: "/gemini-rate-limit-status",
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

    // Get current rate limit status for Gemini API usage
    const status = await ctx.runQuery(api.rateLimiting.getRateLimitStatus, {
      identifier,
    });

    return new Response(
      JSON.stringify({
        identifier,
        requestCount: status.requestCount,
        remaining: status.remaining,
        resetTime: status.resetTime,
        dailyLimit: 10, // Daily limit for Gemini API calls
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