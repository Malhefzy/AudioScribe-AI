# AudioScribe AI

AudioScribe AI is a React application powered by the Google Gemini 3 Pro model. It provides high-quality, long-form audio transcription with automatic speaker identification and markdown formatting.

## Features

- **Gemini 3 Pro**: Utilizes the latest multimodal capabilities for high-accuracy transcription.
- **Long-form Audio**: Handles large audio files via the Gemini Files API.
- **Speaker Identification**: Automatically detects and labels distinct speakers.
- **Interactive Transcript**: Edit speaker names and download the result as Markdown.
- **Token Estimation**: Real-time cost estimation (Input/Output tokens).

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd audio-scribe-ai
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure API Key:**
    *   Create a file named `.env` in the root directory.
    *   Add your Google GenAI API key:
        ```env
        API_KEY=your_google_genai_api_key_here
        ```
    *   *Note: This file is ignored by git to keep your key secure.*

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- @google/genai SDK

## License

MIT
