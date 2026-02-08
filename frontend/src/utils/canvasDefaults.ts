import {
  Editor,
  TLShapeId,
  TLShapePartial,
  createShapeId,
  toRichText,
} from "tldraw";

const SEED_META_TAG = "flowboard-default-seed-v1";





type TextOptions = {
  font?: "draw" | "sans" | "serif" | "mono";
  size?: "s" | "m" | "l" | "xl";
  width?: number;
};

type GeoOptions = {
  width: number;
  height: number;
  label: string;
  geo?: "rectangle" | "ellipse" | "cloud" | "arrow-right" | "arrow-left";
  stroke?: string;
  fill?: "none" | "pattern" | "solid";
  align?: "start" | "middle" | "end";
  verticalAlign?: "start" | "middle" | "end";
  dash?: "draw" | "dotted" | "dashed" | "solid";
};



export const getSeedMetaTag = () => SEED_META_TAG;

export function seedDefaultCanvas(editor: Editor, frameId?: TLShapeId | null) {
  if (!frameId) return;

  const alreadySeeded = editor
    .getCurrentPageShapes()
    .some((shape) => shape.meta?.seedTag === SEED_META_TAG);

  if (alreadySeeded) {
    return;
  }

  const frame = editor.getShape(frameId);

  if (!frame || frame.type !== "aspect-frame") {
    return;
  }

  // Position tutorial content to the right of the frame
  const leftColumnX = 100; // Start after frame with gap
  const topY = -300; // Align with frame top
  const timelineY = topY + 190;

  const seedMeta = { seedTag: SEED_META_TAG };
  const shapes: TLShapePartial[] = [];

  const addText = (
    text: string,
    x: number,
    y: number,
    options?: TextOptions,
    scale?: number,
  ) => {
    shapes.push({
      id: createShapeId(),
      type: "text",
      x,
      y,
      parentId: undefined, // Place in page space, not inside frame
      props: {
        color: "black",
        size: options?.size ?? "l",
        font: options?.font ?? "draw",
        textAlign: "start",
        autoSize: true,
        scale: scale ?? 1,
        richText: toRichText(text),
      },
      meta: seedMeta,
    });
  };

  const addGeo = (
    x: number,
    y: number,
    {
      width,
      height,
      label,
      geo = "rectangle",
      stroke = "black",
      fill = "pattern",
      align = "start",
      verticalAlign = "start",
      dash = "draw",
    }: GeoOptions,
  ) => {
    shapes.push({
      id: createShapeId(),
      type: "geo",
      x,
      y,
      parentId: undefined, // Place in page space, not inside frame
      props: {
        w: width,
        h: height,
        geo,
        color: stroke,
        labelColor: stroke,
        fill,
        dash,
        size: "l",
        font: "sans",
        align,
        verticalAlign,
        scale: 1,
        growY: 0,
        url: "",
        richText: toRichText(label),
      },
      meta: seedMeta,
    });
  };

  addText("Krafity.ai", leftColumnX, topY - 60, { size: "xl" }, 2);
  addText(
    "Plan a shot by laying down a story frame, writing a prompt, and linking it to the next frame.",
    leftColumnX,
    topY + 60,
    { size: "m" },
  );
  addText(
    "Mini walkthrough:\n1. Drop sketches or references inside the frame.\n2. Use arrows to describe motion or continuity.\n3. Click Generate to turn that frame into a video clip.\n4. Repeat again from step 1",
    leftColumnX,
    topY + 110,
    { size: "s" },
  );

  addText(
    "Extra features:\n- Enhance image with one click\n- Trim video clips easily\n- Insert system prompts for camera controls or art direction\n- Global context for better continuity",
    leftColumnX + 600,
    topY + 110,
    { size: "s" },
  );
  addText(`IF ANYTHING UNEXPECTED HAPPENS, CLEAR COOKIES AND TRY AGAIN! 🍪`, leftColumnX, topY + 500, { size: "l", font: "mono" });

  const timelineSteps = [
    {
      title: "Initial Frame",
      detail: "Draw or import a frame to illustrate the scene.",
      color: "blue",
    },
    {
      title: "Annotate",
      detail: "Draw arrows and notes to describe motion and details.",
      color: "light-red",
    },
    {
      title: "Generate Clip",
      detail: "Uses Veo 3 to create a video clip from your frame.",
      color: "light-violet",
    },
  ];

  const timelineStartX = leftColumnX;
  const cardWidth = 320;
  const cardHeight = 150;
  const cardGap = 80;

  timelineSteps.forEach((step, index) => {
    const cardX = timelineStartX + index * (cardWidth + cardGap);
    addGeo(cardX, timelineY + 100, {
      width: cardWidth,
      height: cardHeight,
      label: `${step.title}\n${step.detail}`,
      geo: "rectangle",
      stroke: step.color,
      fill: "solid",
      align: "start",
      verticalAlign: "start",
      dash: "draw",
    });

    if (index < timelineSteps.length - 1) {
      // Create actual arrow shape between cards
      shapes.push({
        id: createShapeId(),
        type: "arrow",
        x: 0,
        y: 100,
        props: {
          start: {
            x: cardX + cardWidth + 10,
            y: timelineY + cardHeight / 2,
          },
          end: {
            x: cardX + cardWidth + cardGap - 10,
            y: timelineY + cardHeight / 2,
          },
          color: step.color,
          size: "m",
          arrowheadStart: "none",
          arrowheadEnd: "arrow",
        },
        meta: seedMeta,
      });
    }
  });



  editor.createShapes(shapes);
}
