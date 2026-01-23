"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Model {
  id: string;
  name: string;
  provider: string;
}

const MODELS: Model[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "Anthropic" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "Google" },
];

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const selectedModel = MODELS.find((m) => m.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder={selectedModel?.name || "Select model"} />
      </SelectTrigger>
      <SelectContent>
        {MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex items-center gap-2">
              <span>{model.name}</span>
              <span className="text-xs text-muted-foreground">
                ({model.provider})
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
