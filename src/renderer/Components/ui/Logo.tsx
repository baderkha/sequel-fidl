/**
 * Sequel Fidl mark (stacked database with a play button) , same drawing as assets/icon.svg
 */
const PATHS = [
    'M16 18 C16 12.5 38 8 60 8 C82 8 104 12.5 104 18 C104 23.5 82 28 60 28 C38 28 16 23.5 16 18 Z',
    'M16 18 V46 C16 54 38 58 60 58 C82 58 104 54 104 46 V18',
    'M16 51 C16 59 38 63 60 63 C82 63 104 59 104 51 M16 51 V79 C16 87 38 91 60 91 C82 91 104 87 104 79 V51',
    'M16 84 C16 92 38 96 60 96 C82 96 104 92 104 84 M16 84 V112 C16 120 38 124 60 124 C82 124 104 120 104 112 V84',
    'M26 30 V42',
    'M26 64 V76',
    'M26 97 V109',
    'M56 31 V49 L71 40 Z',
];

export const BRAND_COLOR = '#8931EA';

export function Logo({ size = 20, color = BRAND_COLOR }: { size?: number; color?: string }) {
    return (
        <svg
            width={size * 0.76}
            height={size}
            viewBox="10 2 100 132"
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label="Sequel Fidl"
        >
            {PATHS.map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}
