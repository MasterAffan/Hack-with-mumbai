# Krafity.ai

Krafity.ai is an AI-powered storyboarding tool that lets you turn static images into cinematic video sequences using hand-drawn sketches and simple annotations.

Instead of writing complex prompts, you draw your intent directly on an image. Arrows for motion, circles for focus, notes for direction. The system interprets those sketches and generates short video clips that can be chained together into full storyboards.

## What it does

* Draw motion and camera instructions directly on images
* Converts sketches into 5–8 second AI-generated video clips
* Automatically cleans annotations before video generation
* Chains clips infinitely using the last frame as the next starting point
* Supports branching storyboards to explore multiple narrative paths
* Merge entire storyboard chains into a single video

## How it works

1. User sketches motion and annotations on an image canvas
2. Gemini analyzes annotations and scene context
3. Annotations are removed to produce a clean frame
4. Veo generates a short video clip from the image and interpreted intent
5. The last frame becomes the input for the next clip

## Tech stack

**Frontend**

* React, TypeScript, Vite
* tldraw (infinite canvas)
* Tailwind CSS, Radix UI
* Cloudflare Pages

**Backend**

* FastAPI
* Google Vertex AI (Veo 3.1, Gemini 2.0 / 2.5 Flash)
* Google Cloud Run
* Google Cloud Storage
* FFmpeg

**Models**

* Google Veo 3.1 for video generation
* Gemini Flash for annotation parsing and context extraction
* Qwen 3D Camera model for multi-angle control

## Use cases

* Storyboarding and animatics
* Rapid video prototyping
* Creative exploration for artists and designers
* Education and visual storytelling
* Pre-production for film and animation teams

## Repository

[https://github.com/MasterAffan/Hack-with-mumbai](https://github.com/MasterAffan/Hack-with-mumbai)

