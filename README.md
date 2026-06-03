# LocalMind

LocalMind is a privacy-focused, local-first AI chat application that runs entirely on your machine. It uses Ollama for local LLM inference, supports RAG (Retrieval-Augmented Generation), and provides a modern web interface.

## Features

- 🤖 **Local AI**: Runs models locally using Ollama – no data leaves your machine
- 💬 **Chat Interface**: Clean, responsive UI for conversations
- 📄 **RAG Support**: Upload documents and ask questions about them
- 🔌 **Plugin System**: Extend functionality with custom plugins
- 📤 **Export**: Export conversations in various formats
- 🎨 **Customizable**: Adjust settings to your preferences

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
- [Ollama](https://ollama.com/download) (for local LLM)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/imDarshanGK/localmind.git
   cd localmind
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   cp frontend/.env.example frontend/.env
   ```

3. **Pull a model (optional but recommended)**
   ```bash
   ollama pull llama3.2
   ```

4. **Start the application**
   ```bash
   docker compose up --build
   ```

5. **Access the app**
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8000](http://localhost:8000)

## Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Troubleshooting

If you encounter any issues during setup, please refer to our [Troubleshooting Guide](docs/troubleshooting.md) for solutions to common problems.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License – see the LICENSE file for details.
