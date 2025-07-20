// Rate limiting utilities for API endpoints
// Implements daily rate limiting with configurable limits per identifier (user/IP)

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Configuration: Daily rate limit
const DAILY_RATE_LIMIT = 10;

/**
 * Check if a request should be rate limited
 * @param identifier - User ID or IP address
 * @returns Object with isAllowed boolean and remaining requests count
 */
export const checkRateLimit = mutation({
  args: {
    identifier: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const now = Date.now();

    // Find existing rate limit record for today
    const existingRecord = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier_and_date")
      .filter((q) => 
        q.eq(q.field("identifier"), args.identifier) && 
        q.eq(q.field("date"), today)
      )
      .first();

    if (!existingRecord) {
      // First request of the day - create new record
      await ctx.db.insert("rateLimits", {
        identifier: args.identifier,
        date: today,
        requestCount: 1,
        lastRequestTime: now,
      });

      return {
        isAllowed: true,
        remaining: DAILY_RATE_LIMIT - 1,
        resetTime: getEndOfDayTimestamp(),
      };
    }

    // Check if rate limit exceeded
    if (existingRecord.requestCount >= DAILY_RATE_LIMIT) {
      return {
        isAllowed: false,
        remaining: 0,
        resetTime: getEndOfDayTimestamp(),
        message: `Daily rate limit of ${DAILY_RATE_LIMIT} requests exceeded. Try again tomorrow.`,
      };
    }

    // Increment request count
    await ctx.db.patch(existingRecord._id, {
      requestCount: existingRecord.requestCount + 1,
      lastRequestTime: now,
    });

    return {
      isAllowed: true,
      remaining: DAILY_RATE_LIMIT - (existingRecord.requestCount + 1),
      resetTime: getEndOfDayTimestamp(),
    };
  },
});

/**
 * Get current rate limit status for an identifier (read-only)
 */
export const getRateLimitStatus = query({
  args: {
    identifier: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split('T')[0];

    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier_and_date")
      .filter((q) => 
        q.eq(q.field("identifier"), args.identifier) && 
        q.eq(q.field("date"), today)
      )
      .first();

    if (!record) {
      return {
        requestCount: 0,
        remaining: DAILY_RATE_LIMIT,
        resetTime: getEndOfDayTimestamp(),
      };
    }

    return {
      requestCount: record.requestCount,
      remaining: Math.max(0, DAILY_RATE_LIMIT - record.requestCount),
      resetTime: getEndOfDayTimestamp(),
    };
  },
});

/**
 * Clean up old rate limit records (older than 7 days)
 * This should be called periodically to prevent database bloat
 */
export const cleanupOldRateLimits = mutation({
  handler: async (ctx) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

    const oldRecords = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lt(q.field("date"), cutoffDate))
      .collect();

    // Delete old records in batches
    for (const record of oldRecords) {
      await ctx.db.delete(record._id);
    }

    return { deletedCount: oldRecords.length };
  },
});

/**
 * Helper function to get end of day timestamp for rate limit reset
 */
function getEndOfDayTimestamp(): number {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime();
}