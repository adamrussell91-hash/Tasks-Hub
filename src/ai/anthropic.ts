export type AnthropicTextBlock = {
  type: string;
  text?: string;
};

export type AnthropicMessageResponse = {
  content?: AnthropicTextBlock[];
};

export async function createAnthropicMessage(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 800,
      system: input.system,
      messages: [{ role: 'user', content: input.user }]
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Anthropic ${response.status}: ${detail}`);
  }
  const body = (await response.json()) as AnthropicMessageResponse;
  return (body.content ?? [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text as string)
    .join('\n')
    .trim();
}
