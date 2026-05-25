import { extractUsageEvent } from "../src/collectors/hermes-bridge.cjs";

const event = extractUsageEvent({
  requestPayload: {
    model: "mimo-v2.5-pro"
  },
  contentType: "application/json",
  responseBody: Buffer.from(
    JSON.stringify({
      id: "chatcmpl_demo",
      model: "mimo-v2.5-pro",
      usage: {
        prompt_tokens: 1234,
        completion_tokens: 321,
        total_tokens: 1555
      }
    })
  )
});

console.log(JSON.stringify(event, null, 2));
