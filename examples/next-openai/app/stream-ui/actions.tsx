import { openai } from '@ai-sdk/openai';
import { CoreMessage, generateId } from 'ai';
import {
  createAI,
  createStreamableValue,
  getMutableAIState as $getMutableAIState,
  streamUI,
  createStreamableUI,
} from 'ai/rsc';
import { Message, BotMessage } from './message';
import { z } from 'zod';

type AIProviderNoActions = ReturnType<typeof createAI<AIState, UIState>>;
// typed wrapper *without* actions defined to avoid circular dependencies
const getMutableAIState = $getMutableAIState<AIProviderNoActions>;

// mock function to fetch weather data
const fetchWeatherData = async (location: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { temperature: '72°F' };
};

export async function submitUserMessage(content: string) {
  'use server';

  const aiState = getMutableAIState();

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      { id: generateId(), role: 'user', content },
    ],
  });

  // 1. Create a wrapping UI stream to display the loading ASAP when the request is received.
  const ui = createStreamableUI(
    <Message role="assistant">Working on that...</Message>,
  );

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>;
  let textNode: React.ReactNode;

  // 2. Make this an IIFE to prevent ui blocking
  (async () => {
    const result = await streamUI({
      model: openai('gpt-4o-2024-08-06', {
        // 3. Force single tool call with all locations at once
        parallelToolCalls: false,
      }),
      system: 'You are a weather assistant.',
      messages: aiState
        .get()
        .messages.map(
          ({ role, content }) => ({ role, content } as CoreMessage),
        ),

      text: ({ content, done, delta }) => {
        if (!textStream) {
          textStream = createStreamableValue('');
          textNode = <BotMessage textStream={textStream.value} />;
        }

        if (done) {
          textStream.done();
          aiState.update({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              { id: generateId(), role: 'assistant', content },
            ],
          });
        } else {
          textStream.append(delta);
        }

        return textNode;
      },
      tools: {
        get_current_weather: {
          description: 'Get the current weather for multiple locations.',
          parameters: z.object({
            // 4. Accept a list of locations to handle in parallel.
            locations: z
              .array(z.string())
              .describe('A list of locations to get the weather for'),
          }),
          generate: ({ locations }) => {
            const toolUI = createStreamableUI(
              <Message role="system">
                Loading weather for {locations.join(', ')}...
              </Message>,
            );

            // 5. Collect promises to await before calling aiState.done
            const promises: Promise<void>[] = [];

            locations.forEach(location => {
              // 6. Finally, create one last layer of streamed UI to be able to update each UI independently.
              const parallelUI = createStreamableUI(
                <Message role="assistant">
                  Loading weather for {location}
                </Message>,
              );
              toolUI.append(parallelUI.value);

              // 7. Another IIFE to append all the streams before calling toolUI.done
              promises.push(
                (async () => {
                  const { temperature } = await fetchWeatherData(location);
                  aiState.update({
                    ...aiState.get(),
                    messages: [
                      ...aiState.get().messages,
                      {
                        id: generateId(),
                        role: 'assistant',
                        content: `The temperature in ${location} is ${temperature}`,
                      },
                    ],
                  });
                  parallelUI.done(
                    <Message role="assistant">
                      <span>
                        The temperature in {location} is{' '}
                        <span className="font-semibold">{temperature}</span>
                      </span>
                    </Message>,
                  );
                })(),
              );
            });

            // 8. Finalize the toolUI node (all parallel UIs have been appended and will be managed by their own IIFE now)
            toolUI.done();

            // 9. Commit the final aiState
            Promise.all(promises).then(() => {
              aiState.done(aiState.get());
            });

            // 10. Return toolsUI.value so it can replace/append to result.value
            return toolUI.value;
          },
        },
      },
    });

    // 11. Commit the final result to the UI, which consistents only of the toolUI (and/or the text stream UI).
    ui.done(result.value);
  })();

  return {
    id: generateId(),
    display: ui.value,
  };
}

export type ClientMessage = CoreMessage & {
  id: string;
};

export type AIState = {
  chatId: string;
  messages: ClientMessage[];
};

export type UIState = {
  id: string;
  display: React.ReactNode;
}[];

export const AI = createAI({
  actions: { submitUserMessage },
  initialUIState: [] as UIState,
  initialAIState: { chatId: generateId(), messages: [] } as AIState,
});
