import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '4rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>holeauth</h1>
      <p>Modular, edge-native auth ecosystem.</p>
      <p>
        <Link href="/docs">Read the docs →</Link>
      </p>
    </main>
  );
}
