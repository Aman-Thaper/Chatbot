// ✅ FRONTEND (App.jsx)
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Virtuoso } from "react-virtuoso";
import ReactMarkdown from "react-markdown";



function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello! 👋 Welcome to Talenticks.\n\nHow can I assist you today? You can ask me anything, or would you like to visit any of these sections?",
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typingText, setTypingText] = useState("");
  const virtuosoRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Quick links to show once after greeting
  const quickLinks = [
    { label: "Dashboard", url: "https://talenticks.meetcs.com/dashboard/" },
    { label: "Leave Management", url: "https://talenticks.meetcs.com/leavemgm/leave-register/" },
    { label: "Finance", url: "https://talenticks.meetcs.com/payroll/payslip/" },
    { label: "Help Videos", url: "https://talenticks.meetcs.com/help_videos/" },
  ];

  useEffect(() => {
    const savedChat = localStorage.getItem("talenticks-chat");
    if (savedChat) {
      setMessages(JSON.parse(savedChat));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("talenticks-chat", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length + (typingText ? 1 : 0),
      behavior: "smooth",
    });
  }, [messages, typingText]);

  

  async function generateAnswer() {
    if (!input.trim()) return;
  
    const timestamp = new Date().toLocaleTimeString();
    const updatedMessages = [...messages, { role: "user", text: input, time: timestamp }];
    setMessages(updatedMessages);
    setLoading(true);
    setInput("");
  
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/chat`, {
        messages: updatedMessages.map((msg) => ({
          role: msg.role,
          content: msg.text,
        })),
      });
  
      let aiReply = response.data.text || "Sorry, I didn't get that.";
  
      await typeAssistantReply(aiReply);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...updatedMessages,
        {
          role: "assistant",
          text: "Something went wrong. Please try again.",
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }
  
  
  
  function typeAssistantReply(fullText) {
    return new Promise((resolve) => {
      let i = 0;
      setTypingText("");

      const interval = setInterval(() => {
        i++;
        setTypingText(fullText.slice(0, i));

        if (i === fullText.length) {
          clearInterval(interval);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: fullText, time: new Date().toLocaleTimeString() },
          ]);
          setTypingText("");
          resolve();
        }
      }, 10);
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) generateAnswer();
    }
  }

  async function clearChat() {
    const initialMessage = {
      role: "assistant",
      text: `Hello! 👋 Welcome to Talenticks.\n\nHow can I assist you today? You can ask me anything, or would you like to visit any of these sections?`,
      time: new Date().toLocaleTimeString(),
    };
    setMessages([initialMessage]);
    setInput("");
    localStorage.removeItem("talenticks-chat");
  }
  

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col h-screen">
      <h1 className="text-4xl font-extrabold text-center text-blue-600 tracking-tight mb-6">
        Talenticks AI Chatbot
      </h1>

      <div className="flex-1 bg-white p-4 rounded border overflow-y-auto flex flex-col relative">
        <Virtuoso
          ref={virtuosoRef}
          data={typingText ? [...messages, { role: "assistant", text: typingText }] : messages}
          itemContent={(index, msg) => (
            <div
              key={index}
              className={`p-3 rounded-lg max-w-[80%] break-words text-sm ${
                msg.role === "user"
                  ? "bg-blue-100 ml-auto text-right text-blue-900"
                  : "bg-gray-100 mr-auto text-left text-gray-700"
              }`}
            >
              <ReactMarkdown
                components={{
                  a: ({ node, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    />
                  ),
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      {...props}
                      className="border-l-4 border-blue-500 pl-4 my-2 italic text-gray-600"
                    />
                  ),
                }}
              >
                {msg.text}
              </ReactMarkdown>

              {/* Quick links shown only below the first assistant message */}
              {msg.role === "assistant" && index === 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {quickLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center transition-colors"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}

              {!typingText || index < messages.length ? (
                <div className="text-xs text-gray-500 mt-1">{msg.time}</div>
              ) : null}
            </div>
          )}
          style={{ flex: "1 1 auto", width: "100%" }}
          followOutput
          atBottomStateChange={(atBottom) => setIsAtBottom(atBottom)}
        />

        {loading && !typingText && (
          <div className="bg-gray-100 mr-auto text-left p-3 rounded-lg max-w-[80%] font-mono text-xl mt-2">
            <TypingDots />
          </div>
        )}

        {!isAtBottom && (
          <button
            onClick={() =>
              virtuosoRef.current.scrollToIndex({ index: messages.length, behavior: "smooth" })
            }
            className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-3 py-1 rounded-full text-sm shadow hover:bg-blue-600 transition-all"
          >
            ↓ New Message
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          generateAnswer();
        }}
        className="mt-4 flex gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask something about your attendance, leaves, payroll..."
          rows={2}
          className="w-full border rounded p-2 resize-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white px-4 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading && !typingText ? "..." : "Send"}
        </button>

        <button
          type="button"
          onClick={clearChat}
          className="bg-red-600 text-white px-4 rounded hover:bg-red-700"
          disabled={loading}
        >
          Clear Chat
        </button>
      </form>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      Typing
      <span className="animate-bounce">.</span>
      <span className="animate-bounce delay-100">.</span>
      <span className="animate-bounce delay-200">.</span>
    </span>
  );
}

export default App;
