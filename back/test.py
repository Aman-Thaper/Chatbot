from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

chat_model = ChatOllama(model="llama3", streaming=True)

for chunk in chat_model.stream([HumanMessage(content="Tell me a story")]):
    print(chunk.content, end="", flush=True)