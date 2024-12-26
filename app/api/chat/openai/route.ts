import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers";
import { ChatSettings } from "@/types";
import { ServerRuntime } from "next";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";

export const runtime: ServerRuntime = "edge";

export async function POST(request: Request) {
  const json = await request.json();
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings;
    messages: any[];
  };

  // Validate the model before making the API call
  const validModels = ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"];

  if (!validModels.includes(chatSettings.model)) {
    return new Response(
      JSON.stringify({
        message: `Invalid model specified: ${chatSettings.model}. Supported models are: ${validModels.join(", ")}.`,
      }),
      { status: 400 }
    );
  }

  try {
    const profile = await getServerProfile();

    checkApiKey(profile.openai_api_key, "OpenAI");

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id,
    });

    const responseStream = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens: chatSettings.model === "gpt-4" ? 150000 : null,
      stream: true,
    });

    // Transform the responseStream into a readable stream
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of responseStream) {
          const data = JSON.stringify(chunk);
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        }
        controller.close();
      },
    });

    // Return the stream as an EventStream-compatible response
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    let errorMessage = "An unexpected error occurred";
    let errorCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return new Response(
      JSON.stringify({ message: errorMessage }),
      { status: errorCode }
    );
  }
}


