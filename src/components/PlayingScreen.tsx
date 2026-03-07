import type { Playing } from "../game/index";
import { AnsweringView } from "./AnsweringView";

type Props = { state: Playing };

export function PlayingScreen({ state }: Props) {
  return <AnsweringView state={state} />;
}
