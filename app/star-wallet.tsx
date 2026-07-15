"use client";

import type { ComponentProps } from "react";
import { Icon, Wallet } from "animal-island-ui";
import walletBag from "animal-island-ui/items/item-022.png";

type StarWalletProps = Omit<ComponentProps<typeof Wallet>, "icon">;

const walletBagSrc = typeof walletBag === "string" ? walletBag : walletBag.src;

export function StarWallet(props: StarWalletProps) {
  return <Wallet {...props} icon={<Icon size="80%" src={walletBagSrc} />} />;
}
