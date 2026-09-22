import type { Request, Response } from "express";

export function requestMetadata(request: Request) {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent")?.slice(0, 500),
  };
}

export function setSessionCookie(
  response: Response,
  name: string,
  value: string,
  expires: Date,
) {
  response.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(response: Response, name: string) {
  response.clearCookie(name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function setDeviceCookie(
  response: Response,
  name: string,
  value: string,
) {
  response.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
}
