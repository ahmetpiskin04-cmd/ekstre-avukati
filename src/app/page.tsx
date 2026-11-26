import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return (
    <div className="hero-glow flex flex-1 flex-col">
      {/* Üst bar (logo, ekstre hapları, maskeleme rozeti, tema) ekstre durumunu bildiği için Dashboard içinde */}
      <Dashboard />
      <footer className="border-t border-line py-5 text-center text-xs text-muted print:hidden">
        Finansal verileriniz hiçbir dış veritabanına kaydedilmez; yalnızca bu tarayıcıda saklanır.
      </footer>
    </div>
  );
}
