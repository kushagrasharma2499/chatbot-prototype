import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits";
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers";
import { ChatSettings } from "@/types";
import OpenAI from "openai";

export const runtime = "edge";

export async function POST(request: Request) {
  const json = await request.json();
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings;
    messages: any[];
  };

  try {
    const profile = await getServerProfile();

    checkApiKey(profile.groq_api_key, "G");

    const groq = new OpenAI({
      apiKey: profile.groq_api_key || "",
      baseURL: "https://api.groq.com/openai/v1",
    });

    const response = await groq.chat.completions.create({
      model: chatSettings.model,
      messages,
      max_tokens: CHAT_SETTING_LIMITS[chatSettings.model]?.MAX_TOKEN_OUTPUT_LENGTH,
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of response) {
            const serializedChunk = JSON.stringify(chunk);
            controller.enqueue(encoder.encode(`data: ${serializedChunk}\n\n`));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred";
    const errorCode = error.status || 500;

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Groq API Key not found. Please set it in your profile settings.";
    } else if (errorCode === 401) {
      errorMessage =
        "Groq API Key is incorrect. Please fix it in your profile settings.";
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
