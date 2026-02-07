# Krafity

Krafity is a modern creative platform combining an interactive canvas and video workflow with AI-assisted capabilities. The goal is to let users sketch, compose, and generate rich multimedia scenes from a graph of frames and actions, then export and share with confidence.

## Vision

- Provide a fast, delightful canvas-first UX for composing scenes and timelines
- Leverage AI to assist content generation and iterative refinement
- Offer a clear job-based backend with robust storage, processing, and export
- Keep the stack simple, portable, and cloud-ready

## Tech Stack

- Frontend: React + TypeScript + Vite, UI primitives (Radix), motion (Framer), canvas tooling (tldraw), Tailwind
- Backend: FastAPI (Python) with Uvicorn, Pydantic-based settings, HTTPX clients
- Cloud: Google services for AI and storage (planned), Docker for containerization

## Monorepo Layout

- frontend/ — SPA codebase (empty scaffold for now)
- backend/ — API and workers (empty scaffold for now)
- docs/ — architecture and design note


## Conventions

- TypeScript strict mode and ESLint/Prettier for the frontend
- Pydantic settings and clear module boundaries for the backend
- Explicit API contracts and versioned endpoints

]
