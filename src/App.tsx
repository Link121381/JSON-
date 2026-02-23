import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Loader2, Copy, Check, RefreshCw, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const fieldSchema = {
  type: Type.OBJECT,
  properties: {
    en: { type: Type.STRING },
    zh: { type: Type.STRING }
  },
  required: ["en", "zh"]
};

const promptSchema = {
  type: Type.OBJECT,
  properties: {
    subject: { ...fieldSchema, description: "The main subject(s) of the image in detail." },
    style: { ...fieldSchema, description: "The artistic style, medium, or aesthetic." },
    lighting: { ...fieldSchema, description: "The lighting setup and mood." },
    composition: { ...fieldSchema, description: "The framing and composition." },
    shootingAngle: { ...fieldSchema, description: "Shooting angle (e.g., low angle, high angle, eye level)." },
    lensSettings: { ...fieldSchema, description: "Lens settings (e.g., aperture, depth of field)." },
    focalLength: { ...fieldSchema, description: "Focal length (e.g., 24mm, 50mm, 85mm, macro)." },
    imageDimensions: { ...fieldSchema, description: "Image dimensions or aspect ratio (e.g., 16:9, 4:3, 1:1)." },
    colors: { ...fieldSchema, description: "The dominant color palette and tones." },
    fullPrompt: { ...fieldSchema, description: "A complete, cohesive prompt combining all these elements." }
  },
  required: ["subject", "style", "lighting", "composition", "shootingAngle", "lensSettings", "focalLength", "imageDimensions", "colors", "fullPrompt"]
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [copied, setCopied] = useState<'all' | 'en' | 'zh' | null>(null);
  const [modifyInstruction, setModifyInstruction] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImage(base64);
      analyzeImage(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64Data: string, mimeType: string) => {
    setIsLoading(true);
    setResult(null);
    try {
      const base64String = base64Data.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              data: base64String,
              mimeType: mimeType,
            }
          },
          "Analyze this image in extreme detail. Provide a comprehensive prompt that could be used to recreate this image using an AI image generator. Include specific details about the subject, style, lighting, composition, shooting angle, lens settings, focal length, image dimensions/aspect ratio, and colors. Provide both English and Chinese translations for each field."
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: promptSchema
        }
      });

      const jsonStr = response.text?.trim() || "{}";
      setResult(JSON.parse(jsonStr));
    } catch (error) {
      console.error("Error analyzing image:", error);
      setResult({ error: "Failed to analyze image. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleModify = async () => {
    if (!modifyInstruction.trim() || !result || result.error) return;
    setIsModifying(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          `Here is the current image prompt JSON:\n${JSON.stringify(result, null, 2)}\n\nUser modification request: "${modifyInstruction}"\n\nPlease update the JSON according to the user's request. Keep the exact same JSON structure, updating both the English ('en') and Chinese ('zh') fields to reflect the changes.`
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: promptSchema
        }
      });
      const jsonStr = response.text?.trim() || "{}";
      setResult(JSON.parse(jsonStr));
      setModifyInstruction("");
    } catch (error) {
      console.error("Error modifying prompt:", error);
    } finally {
      setIsModifying(false);
    }
  };

  const copyToClipboard = (mode: 'all' | 'en' | 'zh') => {
    if (!result) return;

    let textToCopy = "";
    if (mode === 'all') {
      textToCopy = JSON.stringify(result, null, 2);
    } else {
      const filteredResult: Record<string, string> = {};
      for (const [key, value] of Object.entries(result)) {
        if (value && typeof value === 'object' && mode in value) {
          filteredResult[key] = (value as any)[mode];
        } else {
          filteredResult[key] = value as string;
        }
      }
      textToCopy = JSON.stringify(filteredResult, null, 2);
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(mode);
    setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setModifyInstruction("");
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderJson = (obj: any, isRoot = true) => {
    if (typeof obj !== 'object' || obj === null) {
      return <span className="text-emerald-300">"{obj}"</span>;
    }

    const entries = Object.entries(obj);
    return (
      <span>
        <span className="text-zinc-500">{'{'}</span>
        {entries.length > 0 && '\n'}
        {entries.map(([key, value], index) => (
          <div key={key} className="pl-4">
            <span className="text-indigo-300">"{key}"</span>
            <span className="text-zinc-500">: </span>
            {renderJson(value, false)}
            {index < entries.length - 1 && <span className="text-zinc-500">,</span>}
          </div>
        ))}
        <span className="text-zinc-500">{'}'}</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto p-6 lg:p-12 h-screen flex flex-col">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
              Prompt Reverse Engineer
            </h1>
            <p className="text-zinc-400 text-sm mt-1">Upload an image to extract its generative prompt in JSON format.</p>
          </div>
          {image && (
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Start Over
            </button>
          )}
        </header>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">
          {/* Left Column: Upload / Preview */}
          <div className="flex flex-col h-full min-h-[400px]">
            <AnimatePresence mode="wait">
              {!image ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-colors cursor-pointer
                    ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-zinc-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Drop your image here</h3>
                  <p className="text-zinc-400 text-sm text-center max-w-xs">
                    Supports JPG, PNG, WEBP. We'll analyze it and generate a detailed prompt.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-1 relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center"
                >
                  <img
                    src={image}
                    alt="Uploaded preview"
                    className="max-w-full max-h-full object-contain"
                  />
                  {isLoading && (
                    <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm flex flex-col items-center justify-center">
                      <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                      <p className="text-white font-medium animate-pulse">Analyzing image...</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: JSON Output & Modification */}
          <div className="flex flex-col h-full min-h-[400px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                <span className="ml-2 text-xs font-mono text-zinc-500">prompt.json</span>
              </div>
              {result && !result.error && (
                <div className="flex items-center bg-zinc-950 rounded-lg p-1 border border-zinc-800">
                  <button
                    onClick={() => copyToClipboard('all')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                    title="Copy Full JSON"
                  >
                    {copied === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    All
                  </button>
                  <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />
                  <button
                    onClick={() => copyToClipboard('en')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                    title="Copy English Only"
                  >
                    {copied === 'en' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    EN
                  </button>
                  <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />
                  <button
                    onClick={() => copyToClipboard('zh')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                    title="Copy Chinese Only"
                  >
                    {copied === 'zh' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    ZH
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              {!image ? (
                <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-sm">
                  // Waiting for image upload...
                </div>
              ) : isLoading ? (
                <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-sm animate-pulse">
                  // Extracting features...
                </div>
              ) : result ? (
                <motion.pre
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-mono text-sm leading-relaxed"
                >
                  {result.error ? (
                    <span className="text-rose-400">{result.error}</span>
                  ) : (
                    <code className="text-zinc-300">
                      {renderJson(result)}
                    </code>
                  )}
                </motion.pre>
              ) : null}
            </div>

            {/* Modification Input */}
            {result && !result.error && !isLoading && (
              <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                <div className="relative">
                  <input
                    type="text"
                    value={modifyInstruction}
                    onChange={(e) => setModifyInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleModify();
                    }}
                    placeholder="Modify prompt (e.g., 'Change lighting to cyberpunk', '修改为赛博朋克风格')..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-4 pr-12 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                    disabled={isModifying}
                  />
                  <button
                    onClick={handleModify}
                    disabled={!modifyInstruction.trim() || isModifying}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-indigo-400 disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
                  >
                    {isModifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
