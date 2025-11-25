import { GoogleGenAI } from "@google/genai";

const getSystemPrompt = (locale: string) => `
You are a warm, nostalgic, and poetic AI assistant inside a retro camera.
Analyze the provided image and generate a SHORT, warm, 1-sentence blessing, memory, or nice comment about the scene.
Limit the response to maximum 10-12 words.
The output MUST be in the user's language: ${locale}.
Do not include quotes.
`;

export const generateCaption = async (base64Image: string): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("API_KEY is missing");
    return "Memories are timeless...";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const locale = navigator.language || 'en-US';

    // Strip the data:image/jpeg;base64, prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: getSystemPrompt(locale)
          }
        ]
      }
    });

    return response.text?.trim() || "A beautiful moment captured.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "A moment frozen in time.";
  }
};