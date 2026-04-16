import { type TelegramInlineKeyboard } from "@/backend/services/telegram/client";

export function escapeTelegramText(value: string) {
  return value.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export function chunkTelegramMessage(value: string, chunkSize = 3500) {
  if (value.length <= chunkSize) {
    return [value];
  }

  const chunks: string[] = [];
  let remaining = value;

  while (remaining.length > chunkSize) {
    const slice = remaining.slice(0, chunkSize);
    const splitIndex = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const endIndex = splitIndex > 0 ? splitIndex : chunkSize;
    chunks.push(remaining.slice(0, endIndex).trim());
    remaining = remaining.slice(endIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function singleColumnKeyboard(buttons: Array<{ text: string; callbackData: string }>): TelegramInlineKeyboard {
  return {
    inline_keyboard: buttons.map((button) => [{ text: button.text, callback_data: button.callbackData }]),
  };
}
