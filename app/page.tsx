import GomokuBoard from "./_components/GomokuBoard";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        오목
      </h1>
      <GomokuBoard />
    </div>
  );
}
