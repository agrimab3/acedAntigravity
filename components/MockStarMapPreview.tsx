import styles from "./MockStarMapPreview.module.css";

type PreviewSection = {
  name: string;
  label: string;
  color: string;
  cx: number;
  cy: number;
  box: { x: number; y: number; width: number; height: number };
  points: Array<{ x: number; y: number; topic?: boolean }>;
  lines: Array<[number, number]>;
};

const W = 1400;
const H = 700;

const SECTIONS: PreviewSection[] = [
  {
    name: "ENGLISH",
    label: "Gemini",
    color: "#5DCAA5",
    cx: 255,
    cy: 178,
    box: { x: 92, y: 52, width: 330, height: 240 },
    points: [
      { x: 0.22, y: 0.12, topic: true }, { x: 0.56, y: 0.14, topic: true },
      { x: 0.18, y: 0.34 }, { x: 0.58, y: 0.34 },
      { x: 0.24, y: 0.58, topic: true }, { x: 0.53, y: 0.58, topic: true },
      { x: 0.78, y: 0.42, topic: true }, { x: 0.91, y: 0.34, topic: true },
      { x: 0.70, y: 0.76, topic: true },
    ],
    lines: [[0,1],[0,2],[2,4],[1,3],[3,5],[2,3],[4,5],[3,6],[6,7],[5,8]],
  },
  {
    name: "MATH",
    label: "Aquarius",
    color: "#AFA9EC",
    cx: 1065,
    cy: 186,
    box: { x: 930, y: 38, width: 285, height: 280 },
    points: [
      { x: 0.72, y: 0.08, topic: true }, { x: 0.57, y: 0.22, topic: true },
      { x: 0.43, y: 0.30 }, { x: 0.59, y: 0.34, topic: true },
      { x: 0.74, y: 0.39 }, { x: 0.90, y: 0.36, topic: true },
      { x: 0.30, y: 0.46 }, { x: 0.16, y: 0.60, topic: true },
      { x: 0.37, y: 0.83 }, { x: 0.58, y: 0.88, topic: true },
      { x: 0.80, y: 0.79, topic: true },
    ],
    lines: [[0,1],[1,2],[1,3],[3,4],[4,5],[2,6],[6,7],[7,8],[8,9],[9,10]],
  },
  {
    name: "READING",
    label: "Virgo",
    color: "#EF9F27",
    cx: 255,
    cy: 445,
    box: { x: 88, y: 308, width: 290, height: 230 },
    points: [
      { x: 0.92, y: 0.10, topic: true }, { x: 0.76, y: 0.23 },
      { x: 0.60, y: 0.19 }, { x: 0.43, y: 0.31, topic: true },
      { x: 0.24, y: 0.33 }, { x: 0.06, y: 0.30 },
      { x: 0.56, y: 0.50, topic: true }, { x: 0.63, y: 0.68, topic: true },
      { x: 0.53, y: 0.84 }, { x: 0.66, y: 0.93 },
      { x: 0.83, y: 0.88 }, { x: 0.90, y: 0.73 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[3,6],[6,7],[7,11],[7,8],[8,9],[9,10],[10,11]],
  },
  {
    name: "SCIENCE",
    label: "Sagittarius",
    color: "#F0997B",
    cx: 1065,
    cy: 460,
    box: { x: 860, y: 332, width: 380, height: 280 },
    points: [
      { x: 0.27, y: 0.10 }, { x: 0.39, y: 0.18, topic: true },
      { x: 0.61, y: 0.24 }, { x: 0.74, y: 0.07, topic: true },
      { x: 0.89, y: 0.14 }, { x: 0.97, y: 0.21 },
      { x: 0.65, y: 0.45 }, { x: 0.61, y: 0.71, topic: true },
      { x: 0.40, y: 0.77 }, { x: 0.20, y: 0.77 },
      { x: 0.03, y: 0.77 }, { x: 0.35, y: 0.98 },
      { x: 0.86, y: 0.82 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[2,6],[6,7],[7,8],[8,9],[9,10],[8,11],[7,12]],
  },
];

function xy(section: PreviewSection, index: number) {
  const point = section.points[index];
  return {
    x: section.box.x + point.x * section.box.width,
    y: section.box.y + point.y * section.box.height,
  };
}

export default function MockStarMapPreview() {
  return (
    <div className={styles.shell}>
      <svg
        className={styles.map}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Aced star map preview with Gemini, Aquarius, Virgo, Sagittarius, and an estimated ACT score"
      >
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="42%" r="74%">
            <stop offset="0%" stopColor="#14273A" stopOpacity="0.62" />
            <stop offset="52%" stopColor="#0A1726" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#020408" stopOpacity="0" />
          </radialGradient>
          <filter id="starGlow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} fill="#07111d" />
        <rect width={W} height={H} fill="url(#mapGlow)" />

        {Array.from({ length: 88 }, (_, i) => {
          const x = (i * 181 + 37) % W;
          const y = (i * 113 + 29) % H;
          const r = 0.55 + (i % 4) * 0.36;
          return (
            <circle
              key={`ambient-${i}`}
              cx={x}
              cy={y}
              r={r}
              fill={i % 9 === 0 ? "#A8D4FF" : "#FFFFFF"}
              opacity={0.12 + (i % 5) * 0.055}
            />
          );
        })}

        {SECTIONS.map((section) => (
          <g key={section.name}>
            {section.lines.map(([a, b], index) => {
              const p1 = xy(section, a);
              const p2 = xy(section, b);
              return (
                <line
                  key={`line-${index}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={section.color}
                  strokeOpacity="0.30"
                  strokeWidth="1.35"
                />
              );
            })}

            {section.points.map((point, index) => {
              const p = xy(section, index);
              return (
                <g key={`star-${index}`}>
                  <circle cx={p.x} cy={p.y} r={13} fill={section.color} opacity="0.035" />
                  {point.topic ? (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={10}
                      fill="none"
                      stroke={section.color}
                      strokeOpacity="0.17"
                      strokeWidth="1"
                    />
                  ) : null}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={5}
                    fill={section.color}
                    opacity={point.topic ? "0.50" : "0.30"}
                    filter="url(#starGlow)"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={point.topic ? 2.45 : 1.9}
                    fill="#FFFDF8"
                    opacity={point.topic ? "0.88" : "0.72"}
                  />
                </g>
              );
            })}

            {section.cy < 350 ? (
              <>
                <text x={section.cx} y={section.cy - 144} textAnchor="middle" fill={section.color} className={styles.constellation}>
                  {section.label}
                </text>
                <text x={section.cx} y={section.cy - 116} textAnchor="middle" fill={section.color} className={styles.sectionName}>
                  {section.name}
                </text>
              </>
            ) : (
              <>
                <text x={section.cx} y={section.cy + 126} textAnchor="middle" fill={section.color} className={styles.sectionName}>
                  {section.name}
                </text>
                <text x={section.cx} y={section.cy + 148} textAnchor="middle" fill={section.color} className={styles.constellation}>
                  {section.label}
                </text>
              </>
            )}
          </g>
        ))}

        <g className={styles.score}>
          <circle cx={W / 2} cy={H / 2} r="158" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="1" />
          <circle cx={W / 2} cy={H / 2} r="122" fill="none" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1" />
          <text x={W / 2} y={H / 2 - 40} textAnchor="middle" className={styles.scoreTitle}>
            SAMPLE ESTIMATED SCORE
          </text>
          <text x={W / 2} y={H / 2 + 18} textAnchor="middle" className={styles.scoreNumber}>
            30
          </text>
          <text x={W / 2} y={H / 2 + 50} textAnchor="middle" className={styles.scoreSub}>
            sample result · out of 36
          </text>
        </g>
      </svg>
    </div>
  );
}
