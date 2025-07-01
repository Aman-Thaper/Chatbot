import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Virtuoso } from "react-virtuoso";
import ReactMarkdown from "react-markdown";

function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! 👋 Welcome to Talenticks.\n\nHow can I assist you today? You can ask me anything, or would you like to visit any of these sections?",
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typingText, setTypingText] = useState("");
  const virtuosoRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [currentForm, setCurrentForm] = useState(null);
  const [formData, setFormData] = useState({
    companyName: "",
    branch: "",
    designation: "",
    department: "",
    workType: "",
    employeeStatus: ""
  });
  const [formValues, setFormValues] = useState({});

  // Form steps configuration
  const formSteps = [
    { 
      field: "companyName", 
      question: "Company Name",
      type: "text",
      required: true,
      placeholder: "Enter company name"
    },
    { 
      field: "department", 
      question: "Department",
      type: "text",
      required: true,
      placeholder: "Enter department name"
    },
    { 
      field: "branch", 
      question: "Branch (optional)",
      type: "text",
      placeholder: "Enter branch location"
    },
    { 
      field: "designation", 
      question: "Designation (optional)",
      type: "text",
      placeholder: "Enter job title"
    },
    { 
      field: "workType", 
      question: "Work Type",
      type: "select",
      options: ["", "Full-time", "Part-time", "Contract", "Intern"],
      placeholder: "Select work type"
    },
    { 
      field: "employeeStatus", 
      question: "Employee Status",
      type: "select",
      options: ["", "Active", "Inactive", "On Leave", "Terminated"],
      placeholder: "Select employee status"
    }
  ];

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
      index: messages.length - 1,
      behavior: "smooth",
    });
  }, [messages, typingText]);

  async function generateAnswer() {
    if (!input.trim()) return;
  
    const timestamp = new Date().toLocaleTimeString();
    const updatedMessages = [...messages, { 
      role: "user", 
      content: input, 
      time: timestamp 
    }];
    
    setMessages(updatedMessages);
    setLoading(true);
    setInput("");
  
    try {
      // Check if user asked for employee data download
      if (input.toLowerCase().includes("download employee data") || 
          input.toLowerCase().includes("employee data download")) {
        startFormFlow();
        setLoading(false);
        return;
      }

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/chat`, {
        messages: updatedMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });
  
      let aiReply = response.data.text || "Sorry, I didn't get that.";
  
      await typeAssistantReply(aiReply);
    } catch (err) {
      console.error(err);
      addAssistantMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function startFormFlow() {
    setCurrentForm(0);
    setFormValues({});
    addFormMessage(0);
  }

  function addFormMessage(stepIndex) {
    const step = formSteps[stepIndex];
    addAssistantMessage(step.question, step);
  }

  function addAssistantMessage(content, form = null) {
    setMessages(prev => [
      ...prev,
      {
        role: "assistant",
        content,
        form,
        time: new Date().toLocaleTimeString()
      }
    ]);
  }

  function handleFormSubmit(field, value) {
    // Update form values
    const newFormValues = {
      ...formValues,
      [field]: value
    };
    setFormValues(newFormValues);

    // Update the message to show the selected value
    const updatedMessages = [...messages];
    const lastMessageIndex = updatedMessages.length - 1;
    
    if (updatedMessages[lastMessageIndex].form) {
      updatedMessages[lastMessageIndex] = {
        ...updatedMessages[lastMessageIndex],
        content: `${updatedMessages[lastMessageIndex].content}: ${value || 'Not specified'}`,
        form: null // Remove the form after submission
      };
      setMessages(updatedMessages);
    }

    // Check if we have more steps
    if (currentForm < formSteps.length - 1) {
      const nextStep = currentForm + 1;
      setCurrentForm(nextStep);
      addFormMessage(nextStep);
    } else {
      // All steps completed, show confirmation
      showDownloadConfirmation();
      setCurrentForm(null); // Reset form flow
    }
  }

  async function showDownloadConfirmation() {
    // Update form data with collected values
    setFormData(formValues);

    const summary = `
      Here's the data you've provided:
      - Company: ${formValues.companyName}
      - Department: ${formValues.department}
      ${formValues.branch ? `- Branch: ${formValues.branch}\n` : ''}
      ${formValues.designation ? `- Designation: ${formValues.designation}\n` : ''}
      ${formValues.workType ? `- Work Type: ${formValues.workType}\n` : ''}
      ${formValues.employeeStatus ? `- Status: ${formValues.employeeStatus}\n` : ''}
    `;

    await typeAssistantReply(summary);
    
    // Add confirmation buttons
    addAssistantMessage("Would you like to download the employee data now?", {
      type: "confirmation",
      options: ["Yes, download", "No, cancel"]
    });
  }

  function handleConfirmation(confirmed) {
    if (confirmed) {
      downloadEmployeeData();
    } else {
      addAssistantMessage("Employee data download cancelled. Let me know if you need anything else.");
    }
    
    // Reset form data
    setFormData({
      companyName: "",
      branch: "",
      designation: "",
      department: "",
      workType: "",
      employeeStatus: ""
    });
    setFormValues({});
  }

  function downloadEmployeeData() {
    // Create CSV content with sample data
    const headers = "Employee ID,Name,Department,Designation,Branch,Work Type,Status\n";
    const sampleData = [
      `EMP001,John Doe,${formValues.department},${formValues.designation || 'N/A'},${formValues.branch || 'N/A'},${formValues.workType || 'N/A'},${formValues.employeeStatus || 'N/A'}`,
      `EMP002,Jane Smith,${formValues.department},${formValues.designation || 'N/A'},${formValues.branch || 'N/A'},${formValues.workType || 'N/A'},${formValues.employeeStatus || 'N/A'}`,
      `EMP003,Robert Johnson,${formValues.department},${formValues.designation || 'N/A'},${formValues.branch || 'N/A'},${formValues.workType || 'N/A'},${formValues.employeeStatus || 'N/A'}`
    ].join("\n");
    
    const csvContent = "data:text/csv;charset=utf-8," + headers + sampleData;
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${formValues.companyName}_employee_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addAssistantMessage(`Employee data for ${formValues.companyName} has been downloaded successfully!`);
  }
  
  function typeAssistantReply(content) {
    return new Promise((resolve) => {
      let i = 0;
      setTypingText("");

      const interval = setInterval(() => {
        i++;
        setTypingText(content.slice(0, i));

        if (i === content.length) {
          clearInterval(interval);
          addAssistantMessage(content);
          setTypingText("");
          resolve();
        }
      }, 20); // Slightly slower typing for better readability
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && currentForm === null) {
        generateAnswer();
      }
    }
  }

  function clearChat() {
    const initialMessage = {
      role: "assistant",
      content: "Hello! 👋 Welcome to Talenticks.\n\nHow can I assist you today? You can ask me anything, or would you like to visit any of these sections?",
      time: new Date().toLocaleTimeString(),
    };
    setMessages([initialMessage]);
    setInput("");
    setCurrentForm(null);
    setFormValues({});
    localStorage.removeItem("talenticks-chat");
  }

  function renderFormField(form) {
    if (!form) return null;

    if (form.type === "confirmation") {
      return (
        <div className="mt-2 flex gap-2">
          {form.options.map((option, i) => (
            <button
              key={i}
              onClick={() => handleConfirmation(i === 0)}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              {option}
            </button>
          ))}
        </div>
      );
    }

    const currentValue = formValues[form.field] || "";

    return (
      <div className="mt-2">
        {form.type === "text" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={currentValue}
              placeholder={form.placeholder}
              onChange={(e) => {
                setFormValues(prev => ({
                  ...prev,
                  [form.field]: e.target.value
                }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target.value.trim()) {
                  handleFormSubmit(form.field, e.target.value);
                }
              }}
              className="flex-1 border rounded p-2 text-sm"
              autoFocus
            />
            {currentValue.trim() && (
              <button
                onClick={() => handleFormSubmit(form.field, currentValue)}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Submit
              </button>
            )}
          </div>
        )}
        
        {form.type === "select" && (
          <div className="flex gap-2">
            <select
              value={currentValue}
              onChange={(e) => {
                const value = e.target.value;
                setFormValues(prev => ({
                  ...prev,
                  [form.field]: value
                }));
                if (value) {
                  handleFormSubmit(form.field, value);
                }
              }}
              className="flex-1 border rounded p-2 text-sm"
            >
              <option value="">{form.placeholder}</option>
              {form.options.filter(opt => opt).map((option, i) => (
                <option key={i} value={option}>{option}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col h-screen">
      <h1 className="text-4xl font-extrabold text-center text-blue-600 tracking-tight mb-6">
        Talenticks AI Chatbot
      </h1>

      <div className="flex-1 bg-white p-4 rounded border overflow-y-auto flex flex-col relative">
        <Virtuoso
          ref={virtuosoRef}
          data={typingText ? [...messages, { role: "assistant", content: typingText }] : messages}
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
                {msg.content}
              </ReactMarkdown>

              {renderFormField(msg.form)}

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

              <div className="text-xs text-gray-500 mt-1">
                {msg.time}
              </div>
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
              virtuosoRef.current.scrollToIndex({ 
                index: messages.length - 1, 
                behavior: "smooth" 
              })
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
          if (currentForm === null) {
            generateAnswer();
          }
        }}
        className="mt-4 flex gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            currentForm !== null 
              ? "Type here or use the form above..."
              : "Ask something about your attendance, leaves, payroll..."
          }
          rows={2}
          className="w-full border rounded p-2 resize-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || currentForm !== null}
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