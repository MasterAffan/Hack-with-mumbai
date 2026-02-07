import { Theme } from "@radix-ui/themes";
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <Theme>
      <div className="min-h-screen relative bg-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]"></div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              Krafity
            </h1>
            <p className="mt-4 text-gray-600">
              Create frame-based video transitions on a canvas. Click below to open the canvas and generate a demo clip.
            </p>
            <div className="mt-8">
              <Link
                to="/canvas"
                className="inline-block px-5 py-3 rounded bg-black text-white hover:bg-gray-800 transition-colors"
              >
                Open Canvas
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Theme>
  );
}
