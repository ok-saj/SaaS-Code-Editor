// API route to check rate limits for code execution
// This provides a client-side way to check rate limits before executing code

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Extract user identifier from authorization header
    const authHeader = request.headers.get('authorization');
    let identifier = 'anonymous';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      identifier = authHeader.substring(7);
    }
    
    // Fallback to IP address
    if (identifier === 'anonymous') {
      const forwardedFor = request.headers.get('x-forwarded-for');
      const realIP = request.headers.get('x-real-ip');
      identifier = forwardedFor || realIP || 'unknown-ip';
    }

    // RATE LIMITING: Make request to Convex HTTP endpoint to check rate limit
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error('CONVEX_URL not configured');
    }

    // Call the rate limit status endpoint
    const rateLimitResponse = await fetch(`${convexUrl.replace('/api', '')}/rate-limit-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${identifier}`,
        'x-forwarded-for': request.headers.get('x-forwarded-for') || '',
        'x-real-ip': request.headers.get('x-real-ip') || '',
      },
    });

    const rateLimitData = await rateLimitResponse.json();

    // Check if rate limit would be exceeded
    if (rateLimitData.remaining <= 0) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Daily rate limit of ${rateLimitData.dailyLimit} requests exceeded. Try again tomorrow.`,
          resetTime: rateLimitData.resetTime,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitData.dailyLimit.toString(),
            'X-RateLimit-Remaining': rateLimitData.remaining.toString(),
            'X-RateLimit-Reset': rateLimitData.resetTime.toString(),
          }
        }
      );
    }

    return NextResponse.json({
      allowed: true,
      remaining: rateLimitData.remaining,
      resetTime: rateLimitData.resetTime,
    });

  } catch (error) {
    console.error('Rate limit check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // GET endpoint to check current rate limit status
  return POST(request);
}