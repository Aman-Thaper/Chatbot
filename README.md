# HRM AI Chatbot

An intelligent chatbot assistant for the HRM platform that helps users navigate through company policies, HR processes, and platform features.

## Features

- 🤖 AI-powered responses using GPT-4
- 📚 Semantic search through company policies
- 🔍 Smart section recommendations
- 🔗 Automatic link generation to relevant platform sections
- 💬 Natural conversation interface
- 📱 Responsive design

## Tech Stack

- **Frontend**: React.js with Tailwind CSS
- **Backend**: Node.js with Express
- **Database**: MySQL
- **AI**: OpenAI GPT-4 and Embeddings API
- **Vector Search**: Cosine similarity for semantic matching

## Prerequisites

- Node.js (v14 or higher)
- MySQL database
- OpenAI API key

## Environment Variables

Create a `.env` file in the `back` directory with the following variables:

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Aman-Meetcs/HRM-Chatbot.git
cd HRM-Chatbot
```

2. Install dependencies:
```bash
# Install backend dependencies
cd back
npm install

# Install frontend dependencies
cd ../front
npm install
```

3. Set up the database:
- Create a MySQL database
- Import the required tables (tt_menu and tt_menu_role_mapping)
- Update the .env file with your database credentials

4. Add policy documents:
- Place your policy text files in the specified directory
- Update the path in `server.js` if needed

## Running the Application

1. Start the backend server:
```bash
cd back
npm start
```

2. Start the frontend development server:
```bash
cd front
npm run dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
HRM-Chatbot/
├── back/
│   ├── server.js          # Main server file
│   ├── sql_js.js          # Database operations
│   └── qa_dataset.json    # Q&A training data
├── front/
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   └── ...
│   └── ...
└── README.md
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenAI for providing the GPT-4 API
- All contributors who have helped shape this project

---
⭐️ From [Aman-Thaper](https://github.com/Aman-Thaper)
