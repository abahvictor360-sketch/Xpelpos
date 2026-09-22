"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { saveCustomer, searchCustomers } from "@/lib/repository";
import type { Customer } from "@/lib/types";
import { cx } from "@/lib/utils";

interface Props {
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
}

/**
 * The customer field at checkout. It searches the customer list as you type, so
 * the sale attaches to the person who already exists rather than quietly
 * creating a second record for them. Codes are shown because two customers can
 * share a name.
 */
export default function CustomerPicker({ selected, onSelect }: Props) {
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!term.trim()) {
      setMatches([]);
      return;
    }
    let active = true;
    void searchCustomers(term, 6).then((rows) => {
      if (active) setMatches(rows);
    });
    return () => {
      active = false;
    };
  }, [term]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const pick = (customer: Customer) => {
    onSelect(customer);
    setTerm("");
    setOpen(false);
    setAdding(false);
  };

  const addNew = async () => {
    const name = term.trim();
    if (!name) return;
    const customer = await saveCustomer({ name, phone: phone.trim() });
    setPhone("");
    pick(customer);
  };

  if (selected) {
    return (
      <div>
        <span className="label">Customer</span>
        <div className="mt-1 flex items-center gap-2 rounded-2xl border border-olive-500/40 bg-olive-100 px-3 py-2">
          <Check size={15} className="shrink-0 text-olive-700" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-olive-900">
              {selected.name}
            </span>
            <span className="block text-[11px] text-olive-900/60">
              {selected.code}
              {selected.phone ? ` · ${selected.phone}` : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="Remove customer from this sale"
            className="shrink-0 text-olive-900/50 hover:text-olive-900"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  const exactMatch = matches.some(
    (customer) => customer.name.toLowerCase() === term.trim().toLowerCase(),
  );

  return (
    <div ref={wrapper} className="relative">
      <span className="label">Customer</span>
      <label className="mt-1 flex items-center gap-2 rounded-2xl border border-black/10 px-3 py-2 focus-within:border-brand-400">
        <Search size={15} className="shrink-0 text-ink-700/40" />
        <input
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
            setAdding(false);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Walk-in"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>

      {open && term.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-pop">
          {matches.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => pick(customer)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-black/[0.03]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">
                  {customer.name}
                </span>
                <span className="block text-[11px] text-ink-700/50">
                  {customer.code}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </span>
              </span>
            </button>
          ))}

          {!exactMatch && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cx(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50",
                matches.length > 0 && "border-t border-black/5",
              )}
            >
              <UserPlus size={15} />
              Add &ldquo;{term.trim()}&rdquo; as a new customer
            </button>
          )}

          {adding && (
            <div className="border-t border-black/5 p-3">
              <p className="text-xs font-semibold text-ink-900">
                New customer: {term.trim()}
              </p>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone (optional)"
                inputMode="tel"
                className="input mt-2"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={addNew} className="btn-primary flex-1 justify-center">
                  Save and attach
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="btn-ghost flex-1 justify-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
