import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    success: true,
    data: {
      version: "v1",
      auth: "Authorization: Bearer gp_live_… (create keys in /app/developers)",
      resources: ["GET /members", "GET /members/{id}", "GET /classes", "GET /bookings", "POST /bookings", "GET /payments", "GET /checkins", "POST /checkins", "GET /leads", "POST /leads"],
      webhooks: ["booking.created", "booking.cancelled", "payment.succeeded", "payment.failed", "payment.refunded", "checkin.created", "member.created", "lead.created"],
    },
  });
}
