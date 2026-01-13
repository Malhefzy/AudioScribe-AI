import { GoogleGenAI, Type } from "@google/genai";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-3-pro-preview';

/**
 * Uploads a file using the Gemini Files API.
 */
export const uploadAudioFile = async (file: File): Promise<string> => {
  try {
    const uploadResult = await ai.files.upload({
      file: file,
      config: {
        displayName: file.name,
        mimeType: file.type,
      },
    });

    return uploadResult.uri;
  } catch (error) {
    console.error("Upload failed:", error);
    throw new Error("Failed to upload file to Gemini.");
  }
};

/**
 * Polls the file status until it is 'ACTIVE'.
 */
export const waitForFileActive = async (fileUri: string): Promise<void> => {
  const fileName = fileUri.split('/').pop();
  if (!fileName) throw new Error("Invalid file URI");

  const nameMatch = fileUri.match(/files\/([a-z0-9]+)$/);
  const name = nameMatch ? `files/${nameMatch[1]}` : fileUri;

  let isActive = false;
  let attempts = 0;
  const maxAttempts = 60; // 2 minutes approx

  while (!isActive && attempts < maxAttempts) {
    try {
      const fileStatus = await ai.files.get({ name: name });
      const state = fileStatus.state;

      if (state === 'ACTIVE') {
        isActive = true;
      } else if (state === 'FAILED') {
        throw new Error("File processing failed on Gemini servers.");
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
    } catch (e) {
      console.error("Error polling file status:", e);
      throw e;
    }
  }

  if (!isActive) {
    throw new Error("File processing timed out.");
  }
};

/**
 * Transcribes the active audio file.
 */
export const transcribeAudio = async (fileUri: string, mimeType: string, speakerCount?: number) => {
  try {
    const speakerInstruction = speakerCount 
      ? `There are exactly ${speakerCount} distinct speakers in this audio.` 
      : `Identify distinct speakers.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            fileData: {
              mimeType: mimeType,
              fileUri: fileUri,
            },
          },
          {
            text: `
              Please transcribe the audio file.
              
              Instructions:
              1. **Language**: Automatically detect the language. Transcribe strictly verbatim in that language. DO NOT TRANSLATE.
              2. **Completeness**: Transcribe the ENTIRE audio file. Do not summarize. Do not stop early.
              3. **Speakers**: ${speakerInstruction} Label them strictly as **Speaker 1**, **Speaker 2**, etc. consistent throughout the audio.
              4. **Format**: Output in Markdown.
              5. **Timestamps**: Include a timestamp at the start of every turn (e.g., [02:15]).
              6. **Non-speech**: Mark pauses/sounds in italics (e.g., *[laughter]*).
            `
          }
        ]
      },
      config: {
        // Removed maxOutputTokens to allow the model to use its full capacity for long transcripts.
        temperature: 0.2,
        systemInstruction: "You are a professional transcriber. Your output must be a verbatim, word-for-word transcript of the entire audio file provided. Never summarize."
      }
    });

    return {
      text: response.text || "No transcription generated.",
      usageMetadata: response.usageMetadata
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio.");
  }
};