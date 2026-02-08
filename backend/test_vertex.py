"""
Test script to verify Vertex AI credentials and API access.
Tests: Text generation, Image generation, and Video generation capabilities.
"""

import os
import asyncio

# Set the credentials path BEFORE importing google libraries
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"c:\Users\Affan\Desktop\newtest\krafity\krafity-483410-ae9be8b82855.json"

from google import genai
from google.genai.types import GenerateContentConfig, Part

# Configuration - Update these values
PROJECT_ID = "krafity-483410"  # Your Google Cloud project ID
LOCATION = "us-central1"  # Or your preferred region


async def test_text_generation():
    """Test basic text generation with Gemini"""
    print("\n" + "="*50)
    print("TEST 1: Text Generation (Gemini)")
    print("="*50)
    
    try:
        client = genai.Client(
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents="Hello! Can you confirm you're working? Reply with a short greeting.",
        )
        
        print("✅ Text generation SUCCESSFUL!")
        print(f"Response: {response.text}")
        return True
    except Exception as e:
        print(f"❌ Text generation FAILED!")
        print(f"Error: {e}")
        return False


async def test_image_analysis():
    """Test image analysis with Gemini"""
    print("\n" + "="*50)
    print("TEST 2: Image Analysis (Gemini Vision)")
    print("="*50)
    
    try:
        client = genai.Client(
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Create a simple test image (1x1 red pixel PNG)
        # This is a minimal valid PNG for testing
        import base64
        # Minimal 1x1 red PNG
        test_image = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        )
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                Part.from_bytes(data=test_image, mime_type="image/png"),
                "What color is this image? Just say the color."
            ]
        )
        
        print("✅ Image analysis SUCCESSFUL!")
        print(f"Response: {response.text}")
        return True
    except Exception as e:
        print(f"❌ Image analysis FAILED!")
        print(f"Error: {e}")
        return False


async def test_image_generation():
    """Test image generation with Imagen"""
    print("\n" + "="*50)
    print("TEST 3: Image Generation (Imagen)")
    print("="*50)
    
    try:
        client = genai.Client(
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Try to generate an image
        response = client.models.generate_images(
            model="imagen-3.0-generate-002",
            prompt="A simple red circle on white background",
            config={
                "number_of_images": 1,
            }
        )
        
        if response.generated_images:
            print("✅ Image generation SUCCESSFUL!")
            print(f"Generated {len(response.generated_images)} image(s)")
            
            # Save the generated image
            image_data = response.generated_images[0].image.image_bytes
            with open("test_generated_image.png", "wb") as f:
                f.write(image_data)
            print("Saved generated image to: test_generated_image.png")
            return True
        else:
            print("⚠️ Image generation returned no images")
            return False
            
    except Exception as e:
        print(f"❌ Image generation FAILED!")
        print(f"Error: {e}")
        print("\nNote: Image generation (Imagen) requires specific API access.")
        print("If you see a permission error, you may need to enable the Imagen API.")
        return False


async def test_video_generation_check():
    """Check if video generation API is accessible (without actually generating)"""
    print("\n" + "="*50)
    print("TEST 4: Video Generation API Check (Veo)")
    print("="*50)
    
    try:
        client = genai.Client(
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Just check if we can access the models endpoint
        # We won't actually generate a video as it requires a GCS bucket and takes time
        print("Checking Veo API access...")
        
        # Try to list models to verify API access
        models = client.models.list()
        
        veo_available = False
        for model in models:
            if "veo" in model.name.lower():
                veo_available = True
                print(f"  Found Veo model: {model.name}")
        
        if veo_available:
            print("✅ Veo (Video) API access AVAILABLE!")
            print("Note: Actual video generation requires a GCS bucket configured.")
            return True
        else:
            print("⚠️ Veo models not found in available models list")
            print("You may need to request access to Veo API.")
            return False
            
    except Exception as e:
        print(f"❌ Video API check FAILED!")
        print(f"Error: {e}")
        return False


async def main():
    print("="*60)
    print("VERTEX AI CREDENTIALS TEST")
    print("="*60)
    print(f"Project: {PROJECT_ID}")
    print(f"Location: {LOCATION}")
    print(f"Credentials: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}")
    
    results = {}
    
    # Run tests
    results["text"] = await test_text_generation()
    results["image_analysis"] = await test_image_analysis()
    results["image_generation"] = await test_image_generation()
    results["video_check"] = await test_video_generation_check()
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    for test, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {test}: {status}")
    
    all_passed = all(results.values())
    print("\n" + "="*60)
    if all_passed:
        print("🎉 All tests passed! Your Vertex AI credentials are working!")
    else:
        print("⚠️ Some tests failed. Check the errors above.")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
