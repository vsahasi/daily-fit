export function chatModel() {
  return process.env.OPENAI_CHAT_MODEL || "gpt-5.6-terra";
}

export function imageModel() {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
}
