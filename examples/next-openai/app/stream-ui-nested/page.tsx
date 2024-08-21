'use client';

import { Fragment, useState } from 'react';
import type { AI } from './actions';
import { useActions } from 'ai/rsc';

import { useAIState, useUIState } from 'ai/rsc';
import { generateId } from 'ai';
import { Message } from './message';

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions<typeof AI>();

  const handleSubmission = async (message: string) => {
    setMessages(currentMessages => [
      ...currentMessages,
      {
        id: generateId(),
        display: <Message role="user">{message}</Message>,
      },
    ]);

    const response = await submitUserMessage(message);
    setMessages(currentMessages => [...currentMessages, response]);
    setInput('');
  };

  return (
    <div className="flex flex-col-reverse">
      <div className="flex flex-row gap-2 p-2 bg-zinc-100 w-full">
        <input
          className="bg-zinc-100 w-full p-2 outline-none"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="Ask a question"
          onKeyDown={event => {
            if (event.key === 'Enter') {
              handleSubmission(input);
            }
          }}
        />
        <button
          className="p-2 bg-zinc-900 text-zinc-100 rounded-md"
          onClick={() => handleSubmission(input)}
        >
          Send
        </button>
      </div>

      <div className="flex flex-col h-[calc(100dvh-56px)] overflow-y-scroll">
        {messages.length === 0 && (
          <div className="flex items-center justify-center size-full">
            <button
              className="px-4 py-2 bg-zinc-900 text-zinc-100 rounded-md w-fit"
              onClick={() => {
                handleSubmission(
                  'Show me the weather for San Francisco, New York, and Chicago',
                );
              }}
            >
              Test With Example Prompt
            </button>
          </div>
        )}
        <div>
          {messages.map(message => (
            <Fragment key={message.id}>{message.display}</Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
