#!/usr/bin/env node
import { getApiConfig, callMercuryTurn } from "../arms/wm-jev-mercury.mjs";

console.log("=================================================");
console.log(" WindTunnel: Mercury 2.5 Standalone WebMCP Test  ");
console.log("=================================================\n");

const config = getApiConfig();

console.log("Configuration Status:");
console.log(`- Mode:              ${config.isSimulated ? "SIMULATION / DRY-RUN" : "LIVE API"}`);
console.log(`- Mercury Endpoint:  ${config.mercuryBaseUrl}`);
console.log(`- Mercury Key Set:   ${config.mercuryKey ? "YES (masked: " + config.mercuryKey.slice(0, 6) + "...)" : "NO"}`);
console.log("\n-------------------------------------------------");
console.log("Testing Mercury 2.5 Driving WebMCP in 1 Step...");

const sampleTask = "Find the latest blog post about Next.js and open it.";
const mockTools = [
  {
    name: "search_posts",
    description: "Search blog posts by keyword",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_post_details",
    description: "Get full details of a post by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the post" },
      },
      required: ["id"],
    },
  },
];

try {
  const turnResult = await callMercuryTurn({
    taskPrompt: sampleTask,
    history: [],
    tools: mockTools,
    config,
  });

  console.log(`  ✓ Mercury Status:    "${turnResult.status}"`);
  if (turnResult.status === "call") {
    console.log(`  ✓ Selected Tool:     "${turnResult.tool}"`);
    console.log(`  ✓ Generated Args:   `, JSON.stringify(turnResult.args, null, 2));
  } else {
    console.log(`  ✓ Final Answer:      "${turnResult.answer}"`);
  }
  console.log(`  ✓ Turn Latency:      ${turnResult.durationMs.toFixed(1)}ms`);
  console.log(`  ✓ Tokens:            ${turnResult.tokens.input} in / ${turnResult.tokens.output} out`);

  console.log("\n-------------------------------------------------");
  console.log("Testing Follow-up Step (handling tool result)...");

  const followUpResult = await callMercuryTurn({
    taskPrompt: sampleTask,
    history: [
      {
        tool: turnResult.tool,
        input: turnResult.args,
        result: { id: "post-101", title: "Introducing Next.js App Router", author: "Vercel" },
      },
    ],
    tools: mockTools,
    config,
  });

  console.log(`  ✓ Mercury Follow-up: "${followUpResult.status}"`);
  if (followUpResult.status === "finish") {
    console.log(`  ✓ Final Answer:      "${followUpResult.answer}"`);
  } else {
    console.log(`  ✓ Next Tool:         "${followUpResult.tool}"`);
  }
  console.log(`  ✓ Latency:           ${followUpResult.durationMs.toFixed(1)}ms`);
  console.log(`  ✓ Tokens:            ${followUpResult.tokens.input} in / ${followUpResult.tokens.output} out`);

  console.log("\n✓ Mercury 2.5 WebMCP standalone test completed successfully!");
} catch (error) {
  console.error("\n❌ Test encountered an error:", error.message);
  process.exit(1);
}
