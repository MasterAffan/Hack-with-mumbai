# Architecture

## Overview

Krafity is a two-tier application:
- Frontend: a React + TypeScript SPA built with Vite
- Backend: a Python FastAPI service exposing REST endpoints

The system centers on a canvas-driven editor and a job pipeline that renders and exports media. AI services and cloud storage are integrated via the backend.

## Components

- Frontend (SPA)
  - Canvas UI and timeline views
  - Auth and routing
  - Job creation and status polling
  - Export and download UX
- Backend (API)
  - Auth validation
  - Job orchestration and state
  - Storage abstraction (uploads, signed URLs)
  - Rendering pipeline and AI calls

## Data Flow

1. User composes a scene and triggers an action (e.g., generate, export)
2. Frontend creates a job via REST (POST /jobs)
3. Backend persists job state and starts processing
4. Backend interacts with storage (upload/read) and AI services as needed
5. Frontend polls or subscribes to job status (GET /jobs/:id)
6. On completion, frontend fetches artifacts (media URLs) for preview or download

## API Contracts (initial sketch)

- POST /jobs — create a job with inputs
- GET /jobs/:id — get job status and outputs
- POST /uploads — request upload tokens or signed URLs
- GET /assets/:id — retrieve generated assets

## Configuration

- Frontend: environment variables for API base URL and feature flags
- Backend: environment variables for credentials, storage buckets, and AI endpoints

## Deployment

- Local dev: run frontend and backend separately
- Containerization planned with Docker
- Cloud build and CI to be added after Day 1

## Roadmap Notes

- Add WebSocket or server-sent events for live job updates
- Harden storage and access control
- Version API and document endpoints thoroughly
