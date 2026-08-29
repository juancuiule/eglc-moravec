import { FastifyRequest } from "fastify";
import * as z from "zod";

export function parseBody<T>(
  body: FastifyRequest["body"],
  schema: z.Schema<T>,
): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error("invalid_request") as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 400;
    error.code = "invalid_request";
    throw error;
  }
  return result.data;
}
