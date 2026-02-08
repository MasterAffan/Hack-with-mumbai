import React from "react";
import { MousePointer2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
// Make sure this path matches where you saved the image in your project
import HeroImage from "../../assets/logo1.png";

const Hero: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen flex items-center py-20 overflow-hidden">
      {/* Background Blur - Adjusted position slightly for split layout */}
      <div className="absolute top-[20%] left-[20%] w-[600px] h-[600px] bg-brand-accent/10 rounded-full blur-[250px] -z-10 pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left Column: Text Content */}
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-normal text-gray-900 mb-6 leading-tight font-ananda">
              Storyboard Your Vision <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-accent to-brand-indigo inline-block px-2 pb-4 -mb-2">
                Frame by Frame.
              </span>
            </h1>

            <p className="text-xl text-gray-600 mb-8 leading-relaxed font-light max-w-lg mx-auto">
              Create a storyboard by drawing instructions on any image. Krafity.ai
              turns your rough sketches into context-aware video clips that extend
              infinitely.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate('/canvas')}
                className="w-full sm:w-auto px-8 py-4 bg-black/80 backdrop-blur-md text-white font-bold rounded-xl hover:bg-black transition-all duration-200 flex items-center justify-center gap-2 shadow-xl shadow-black/10 group border border-white/10 cursor-pointer"
              >
                Start Creating
                <MousePointer2 className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Right Column: Image */}
          <div className="relative flex justify-center lg:justify-end">
            {/* Optional: Add a subtle float animation or shadow to the image to make it pop */}
            <img
              src={HeroImage}
              alt="Krafity AI creative collage"
              className="w-full max-w-lg lg:max-w-2xl h-auto object-contain drop-shadow-xl"
            />
          </div>

        </div>
      </div>
    </section>
  );
};

export default Hero;