import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);
const KEY_PREFIX = "mdp_cart:";

// Each signed-in account gets its own saved cart, and a signed-out visitor has a
// "guest" cart. This keeps one person's quote items from showing up for the
// next person who signs in on the same browser.
const keyFor = (uid) => KEY_PREFIX + (uid || "guest");

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function write(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // storage full or unavailable: the cart just won't persist
  }
}

export function CartProvider({ children }) {
  const { user, loading } = useAuth();
  const uid = user?.uid || null;
  const [items, setItems] = useState([]);
  const activeKey = useRef(null); // which cart `items` currently belongs to

  // Switch carts when the signed-in person changes (sign in, sign out, switch account).
  useEffect(() => {
    if (loading) return;
    const key = keyFor(uid);
    let next = read(key);
    if (uid) {
      // A guest who built a quote and then signed in keeps it, once.
      const guestKey = keyFor(null);
      const guest = read(guestKey);
      if (guest.length && next.length === 0) {
        next = guest;
        write(key, next);
      }
      if (guest.length) {
        try { localStorage.removeItem(guestKey); } catch { /* ignore */ }
      }
    }
    activeKey.current = key;
    setItems(next);
  }, [uid, loading]);

  // Save changes to whichever cart is active.
  useEffect(() => {
    if (activeKey.current) write(activeKey.current, items);
  }, [items]);

  function addItem(config) {
    setItems((prev) => [...prev, { ...config, cartId: crypto.randomUUID() }]);
  }
  function removeItem(cartId) {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  }
  function clearCart() {
    setItems([]);
  }

  const total = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}