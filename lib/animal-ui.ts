import type { ComponentType } from "react";
import type {
  ButtonProps,
  CardProps,
  InputProps,
  ProgressProps,
  SwitchProps,
  TagProps,
  TitleProps,
  WalletProps
} from "animal-island-ui";

// The package root eagerly loads every component. Direct imports keep the
// server-rendered static preview limited to the components used by this app.
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Button as ButtonImplementation } from "animal-island-ui/es/components/Button/Button.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Card as CardImplementation } from "animal-island-ui/es/components/Card/Card.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Input as InputImplementation } from "animal-island-ui/es/components/Input/Input.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Progress as ProgressImplementation } from "animal-island-ui/es/components/Progress/Progress.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Switch as SwitchImplementation } from "animal-island-ui/es/components/Switch/Switch.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Tag as TagImplementation } from "animal-island-ui/es/components/Tag/Tag.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Title as TitleImplementation } from "animal-island-ui/es/components/Title/Title.js";
// @ts-ignore animal-island-ui does not publish declarations for its ES subpaths.
import { Wallet as WalletImplementation } from "animal-island-ui/es/components/Wallet/Wallet.js";

export const Button = ButtonImplementation as ComponentType<ButtonProps>;
export const Card = CardImplementation as ComponentType<CardProps>;
export const Input = InputImplementation as ComponentType<InputProps>;
export const Progress = ProgressImplementation as ComponentType<ProgressProps>;
export const Switch = SwitchImplementation as ComponentType<SwitchProps>;
export const Tag = TagImplementation as ComponentType<TagProps>;
export const Title = TitleImplementation as ComponentType<TitleProps>;
export const Wallet = WalletImplementation as ComponentType<WalletProps>;
