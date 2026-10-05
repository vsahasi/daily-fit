"use client";

import { useMemo, useState } from "react";
import { ItemCard } from "@/components/item-card";
import { UploadDrop } from "@/components/upload-drop";

type Piece = {
  id: string;
  name: string;
  category: string;
  material: string | null;
  warmth: number;
  status: string;
  worn: string | null;
};

const filters = [
  { id: "all", label: "All" },
  { id: "top", label: "Knit" },
  { id: "bottom", label: "Trouser" },
  { id: "outer", label: "Coat" },
  { id: "shoes", label: "Shoe" },
  { id: "accessory", label: "Extra" },
  { id: "wash", label: "Wash" },
];

const sections = [
  { id: "top", label: "Knit" },
  { id: "bottom", label: "Trouser" },
  { id: "outer", label: "Coat" },
  { id: "shoes", label: "Shoe" },
  { id: "accessory", label: "Extra" },
];

export function ClosetGrid({ items }: { items: Piece[] }) {
  const [filter, setFilter] = useState("all");
  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "wash") return items.filter((item) => item.status === "wash");
    return items.filter((item) => item.category === filter);
  }, [filter, items]);

  function cards(list: Piece[], showUpload = false) {
    return (
      <div className="grid grid-cols-1 gap-x-3 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {showUpload ? <UploadDrop variant="tile" /> : null}
        {list.map((item) => (
          <ItemCard
            key={item.id}
            id={item.id}
            name={item.name}
            material={item.material}
            warmth={item.warmth}
            status={item.status}
            worn={item.worn}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap">
        {filters.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="chip"
            data-on={filter === chip.id}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {filter === "all" ? (
        <div className="flex flex-col gap-14">
          {sections.map((section, index) => {
            const list = items.filter((item) => item.category === section.id);
            if (list.length === 0 && index !== 0) return null;
            return (
              <section key={section.id}>
                <h2 className="mb-5 text-[18px]">{section.label}</h2>
                {cards(list, index === 0)}
              </section>
            );
          })}
        </div>
      ) : (
        cards(visible, true)
      )}
    </div>
  );
}
