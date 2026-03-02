import createClient from "openapi-fetch";
import type { paths } from "./generated/compute.d.ts";
import { authMiddleware, type ClientOptions } from "./middleware.ts";

/** Create a type-safe client for the Bunny Edge Scripting (Compute) API. */
export function createComputeClient(options: ClientOptions) {
  const client = createClient<paths>({ baseUrl: options.baseUrl });
  client.use(authMiddleware(options));
  return client;
}
