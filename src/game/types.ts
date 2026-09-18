export type PotionId = "mid" | "weak" | "potent" | "disease" | "manaSmall" | "manaMid" | "manaLarge";

export interface Bag {
  mid: number;
  weak: number;
  potent: number;
  disease: number;
  manaSmall: number;
  manaMid: number;
  manaLarge: number;
  /** Gazuas: abrem baús e portas trancadas no mapa (não são poção, contam à parte). */
  lockpick: number;
}

export interface Spells {
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  tier5: number;
  tier6: number;
  tier7: number;
  tier8: number;
  tier9: number;
  tier10: number;
}

export const TIER_KEYS = ["tier1", "tier2", "tier3", "tier4", "tier5", "tier6", "tier7", "tier8", "tier9", "tier10"] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export type TerrainId = "plains" | "woods" | "ruins" | "water" | "ember" | "hill" | "flame" | "column" | "nave" | "barricade" | "highwood" | "highruin" | "chest" | "door" | "deadtree" | "void" | "snow";
/** Which faction a unit fights for.
 *
 * "neutral" is the wild-beast side: it holds its ground (never enters the turn order, so it
 * takes no turn and the AI never runs for it), it is not what a "clear the map" victory
 * counts, and it can still be attacked by the player. Striking one wakes every living
 * neutral of that same class on the map — the whole species turns "enemy" at once (see
 * BattleEngine.provoke) and starts acting from the following round. Nothing turns back. */
export type Side = "player" | "enemy" | "neutral";
export type ClassId =
  | "ancientGolem"
  | "swordsman"
  | "archer"
  | "mage"
  | "healer"
  | "soldier"
  | "brigand"
  | "captain"
  | "cultist"
  | "cultistV2"
  | "horror"
  | "asherah"
  | "pikeman"
  | "wardog"
  | "troll"
  | "morvenianWolf"
  | "punisher"
  | "theButcher"
  | "birolho"
  | "birolho2"
  | "birolho3"
  | "swampBlueCalf"
  | "assassin"
  | "rogue"
  | "lancer"
  | "aldric"
  | "sandoval"
  | "kaelFinal"
  | "kaelEarly"
  | "neera"
  | "voss"
  | "salazar"
  | "conjurer"
  | "paladin"
  | "heavyKnight"
  // Promoted classes (promotion at level 15) — provisional stats/sprites, wired for
  // spell-slot progression only. Combat stats, real art and the promotion quest come later.
  | "elementalist"
  | "warlock"
  | "sorcerer"
  | "necromancer"
  | "cleric"
  | "bishop"
  | "ranger"
  | "sentinel"
  | "templar"
  // Conjurer tier 1 (Summon Familiar): not a recruitable class — its combat stats are
  // computed live from its summoner (see castSummonFamiliar), CLASSES.familiar only
  // supplies a sprite/size/range fallback and satisfies the ClassId-keyed tables below.
  | "familiar";
export type SpriteId = "kael" | "nira" | "voss" | "salazar" | "malrec" | "aldric" | "defaultLancer" | "soldier" | "brigand" | "captain" | "sorcerer" | "horror" | "Asherah" | "pikeman" | "wardog" | "troll" | "morvenian-wolf" | "punisher" | "theButcher" | "birolho" | "birolho2" | "birolho3" | "familiar" | "swamp-blue-calf" | "ancient-golem" | "lancer" | "sandoval" | "kaelFinal" | "kaelEarly" | "conjurer" | "cultist-v2";
export type HealId = "cureMinor" | "cureWounds" | "cureLight";
export type SpellKind =
  | "fireball"
  | HealId
  | "longShot"
  | "piercing"
  | "lightning"
  | "lightningTier3"
  | "magicMissile"
  | "causticVenom"
  | "doubleStrike"
  | "cleave"
  | "cureDisease"
  | "piercingThrust"
  | "sweep"
  | "trip"
  | "summonFamiliar"
  | "webOfDreams"
  | "multiShot"
  | "secondWind"
  | "auraOfProtection"
  | "divineWrath"
  | "shoulderSmash"
  | "intimidatingPresence"
  | "stampede"
  | "shock";
export type ScreenId = "boot" | "title" | "campaign" | "mapChoice" | "vauIntro" | "worldMap" | "overworldMap" | "briefing" | "cutscene" | "epilogue" | "battle" | "victory" | "defeat" | "inn" | "testMenu" | "mapEditor";
export type Phase = "player" | "enemy";
export type InputMode = "idle" | "selected" | "awaitAction" | "awaitAttack" | "awaitOffHand" | "awaitSpell" | "awaitPotion" | "locked";

export interface Point {
  x: number;
  y: number;
}

export interface TerrainDef {
  id: TerrainId;
  name: string;
  moveCost: number;
  def: number;
  atk: number;
  passable: boolean;
  hazardDice?: number;
  hazardFaces?: number;
  height?: number;
  blocksShot?: boolean;
  cover?: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  hp: number;
  atk: number;
  mag: number;
  def: number;
  res: number;
  mov: number;
  minRange: number;
  maxRange: number;
  sprite: SpriteId;
  size: number;
  /** Footprint block for big creatures (size >= 4), in hexes. Defaults to 2 wide x 4 tall. */
  footprintW?: number;
  footprintH?: number;
  /**
   * Explicit footprint shape for big creatures (size >= 4), as {dx, dy} offsets from the
   * unit's own tile — dy: 0 is the front row (feet, closest to the player), negative dy is
   * further back. Overrides footprintW/footprintH when set, for shapes that aren't a plain
   * rectangle.
   */
  footprintOffsets?: { dx: number; dy: number }[];
  /** Archetype speed rank (1 fastest .. 10 slowest), converted to an initiative bonus. */
  init?: number;
  /** Marks this class as a named boss: boss objectives recognize it and the battle renders its chief marker. */
  boss?: true;
  /** Marks a class as a summon rather than a member of the cast: conjured into a battle by
   * a spell (the Familiar by the Conjurer's tier 1), gone when it ends, and outside the
   * party's defeat check — losing every summon on the board never loses the mission. It is
   * a property of the class, not of how the unit reached the board, so a summon dropped
   * straight onto a map in the editor behaves the same as one conjured in play. Every
   * summon class that gets added should carry this. */
  summon?: true;
}

/** One reply choice inside a branching DialogLine. Picking it jumps to `next`, or ends the
 * tree if `next` is absent/null — same convention as DialogLine.next below. */
export interface DialogReply {
  text: string;
  next?: string | null;
}

/** One screen of the dialog popup: a speaker, an optional portrait, and the line itself.
 * Either it links straight to the next line (`next`, plain "OK" to continue) or it branches
 * (`replies`, one button per reply) — never both; `replies` wins if somehow both are set. */
export interface DialogLine {
  id: string;
  speaker: string;
  /** A SpriteId to resolve a portrait image from (see resolveDialogPortrait) — omitted shows
   * no image, just the speaker name and text. */
  portrait?: SpriteId;
  text: string;
  replies?: DialogReply[];
  next?: string | null;
}

/** A whole conversation: attached to a Mission (intro/outro) or to a neutral Spawn (an NPC's
 * own conversation, replayed from `startId` every time that unit is clicked). */
export interface DialogTree {
  id: string;
  startId: string;
  lines: DialogLine[];
}

export interface Spawn {
  name: string;
  classId: ClassId;
  x: number;
  y: number;
  /** Enemy-only: skips the normal 1%-per-kill loot roll and always drops something (from
   * the same random weapon-or-gear pool a chest rolls from) when this unit dies — for named
   * unique bosses the mission wants to reliably reward. */
  guaranteedDrop?: boolean;
  /** Turns this spawn into a talkable NPC: clicking it opens the tree instead of the normal
   * attack/inspect flow, and it can never be attacked (see attackableByPlayer in engine.ts).
   * Meant for neutral-side spawns — a neutral with no dialog stays the existing wild-beast
   * behavior, unchanged. */
  dialog?: DialogTree;
}

export type WinCondition = "rout" | "boss";

/** A multi-hex terrain prop (mountain, ruin, bridge, ...): rendered as a single image
 * spanning several hexes rather than clipped to one, drawn on top of the regular tile
 * grid so it doesn't need to fill each hex's exact shape. Every hex in its footprint is
 * impassable and blocks line of sight, independent of whatever terrain tile is under it. */
export interface DecorationDef {
  id: string;
  name: string;
  /** Hex offsets from the anchor cell (dx/dy in board coordinates, same convention as
   * Unit.footprintOffsets — {dx:1,dy:0} is always the same-row neighbor). */
  footprint: { dx: number; dy: number }[];
  /** The terrain this prop means, if it means one.
   *
   * Decorations are art: every rule — whether a hex can be walked, shot through or stood
   * on top of — comes from the tile underneath, which is why the rocks that rockifyColumns
   * draws leave their column tile in place. A house you can climb is a house prop sitting
   * on "highruin". Naming it here lets the editor lay the tile with the prop, so the
   * picture and the rules cannot drift apart. */
  tile?: TerrainId;
  /** Draw this prop after character sprites so near-side scenery can naturally occlude
   * them. This is visual-only: it does not change movement, line of sight, or terrain. */
  foreground?: boolean;
  /** Explicit sprite-depth layer. “behind” stays above the ground and selection overlay,
   * but below characters; “front” occludes everything behind the prop. */
  unitLayer?: "behind" | "front";
  /** Compatible repeating modules may share exactly one joining hex in the editor. */
  repeatGroup?: string;
  /** Optional vertical presentation multiplier for tall isometric scenery. */
  heightScale?: number;
}

/** A decoration placed on a mission's map, anchored at (x,y). */
export interface DecorationPlacement {
  id: string;
  x: number;
  y: number;
  /** How far the prop is turned, in sixths of a circle (0-5). A hexagon maps onto itself
   * every 60 degrees, so those are the only turns whose footprint still lands on real
   * hexes. Optional: a map saved before props could turn has no such key, read as 0. */
  rot?: number;
  /**
   * Per-placement rule overrides, set by the two switches in the map editor.
   *
   * Both are additive: absent or false adds nothing and the hex keeps whatever the
   * prop's `DecorationDef.tile` (or the painted terrain) already said, so no map saved
   * before these existed changes behaviour. They cannot take a property away — a
   * barricade stays impassable with `blocksPath` off, because its definition is what
   * makes it solid.
   *
   * They work by choosing the terrain stamped under the prop when the board loads, not
   * by adding a second place where rules live: everything in this engine reads movement,
   * cover and line of sight off `tiles` alone (see footprintCost, clearShot), and the
   * comment on DecorationDef.tile explains why that is worth keeping.
   */
  blocksPath?: boolean;
  yieldsHighGround?: boolean;
}

/** A permanent WebGL elemental FX (src/game/gfx) anchored at (x,y) on a mission's map —
 * a lava pit's fire, a frozen pond's ice glint, a rune circle's holy glow, and so on. Placed
 * in the map editor's "FX" mode; spawned once when the battle loads and left running for the
 * whole fight (see BattleEngine.elementalFxPlacements / BattleCanvas). */
export interface ElementalFxPlacement {
  id: string;
  kind: "fire" | "ice" | "water" | "lightning" | "acid" | "holy" | "darkness" | "shore" | "shore2" | "water2" | "water3" | "water4" | "water5";
  x: number;
  y: number;
  /** Footprint as a multiple of one hex's tile size. Omitted = the renderer's default. */
  radiusTiles?: number;
  /** Radians; mainly useful for lightning's tall/narrow bolt shape. */
  rotation?: number;
}

export interface Mission {
  id: string;
  index: number;
  title: string;
  place: string;
  briefing: string;
  objective: string;
  win: WinCondition;
  cols: number;
  rows: number;
  layout: string[];
  playerSpawns: Spawn[];
  enemySpawns: Spawn[];
  /** Wild things that start on no side. Optional: a mission without any is every mission
   * shipped before neutrals existed, and reads as an empty list. */
  neutralSpawns?: Spawn[];
  /** A specific track from public/game/MUSIC (by file name) to play through this mission,
   * instead of the theme its id would otherwise fall into. Absent means the usual theme. */
  music?: string;
  hub?: boolean;
  /** Whether stampTactics dresses this map — the pass that scatters barricades, hills and
   * the high-terrain variants over it after the layout is doubled. On unless a map says
   * otherwise, so nothing already shipped changes; turn it off on a map placed by hand,
   * where the scatter would paint over deliberate work. */
  autoTactics?: boolean;
  /** Whether this mission is played under fog of war: the party sees a radius around
   * itself, terrain it has walked past stays remembered but dim, and enemies it has
   * no sight of are neither drawn nor targetable. Off unless a map asks for it, so
   * every mission shipped before fog existed plays exactly as it always did — the
   * flag is for dungeon levels built around not seeing what is coming. */
  fog?: boolean;
  /** Which art variant to use per tile, row-major, same indexing as layout flattened.
   * Missing/undefined index or omitted array entirely means variant 0 (the default) —
   * existing missions never set this and keep rendering exactly as before. */
  tileVariants?: number[];
  /** Default ground chosen in the map editor. Terrain-changing decorations restore this tile when removed. */
  baseTile?: TerrainId;
  baseVariant?: number;
  /** How far each tile's art is turned, in sixths of a circle (0-5), row-major like
   * tileVariants. A hex maps onto itself every 60 degrees, so its art can be spun without
   * the shape or its neighbours moving — which is what makes a coastline, a road or a wall
   * meet the tile next to it instead of running the wrong way. Optional and absent by
   * default: a mission without it draws every tile the way it was painted. */
  tileRots?: number[];
  /** Multi-hex terrain props (mountains, ruins, bridges, ...) placed on this map.
   * Omitted/empty on every existing mission — purely additive. */
  decorations?: DecorationPlacement[];
  /** Permanent elemental GPU FX (lava fire, icy glints, ...) placed on this map. Omitted on
   * every existing mission — purely additive. */
  elementalFx?: ElementalFxPlacement[];
  /** Coordinates of chests on this map that should roll noticeably better loot when opened
   * — same pool and range as a normal chest (see useLockpick), just tipped toward the
   * better end: more Ember, better gear odds. For a chest worth gating behind a locked
   * door/sub-area rather than just leaving out in the open. Omitted on every existing
   * mission — purely additive. */
  betterChests?: { x: number; y: number }[];
  /** Shown once, before the player can act, right as the battle screen opens. Omitted on
   * every existing mission — purely additive. */
  introDialog?: DialogTree;
  /** Turns introDialog off without deleting it — absent behaves as on whenever introDialog
   * is set, so only an explicit `false` ever suppresses it. */
  introDialogEnabled?: boolean;
  /** Shown once victory is confirmed (the player clicked "Encerrar missão"), before leaving
   * to the results screen. Never shown on defeat. Omitted on every existing mission. */
  outroDialog?: DialogTree;
  /** Same on/off convention as introDialogEnabled. */
  outroDialogEnabled?: boolean;
}

/** A travel spot on the campaign world map. Most locations cover a single mission; a
 * location can also bundle a short arc of missions (e.g. an approach, an encounter, and
 * its aftermath at the same landmark) picked from one sub-menu instead of getting a
 * marker each — missionIds just lists them in story order. */
export interface WorldLocation {
  id: string;
  name: string;
  /** Position on the world map image, in percent (0-100) of its width/height. */
  x: number;
  y: number;
  missionIds: string[];
  /** RPG map only: absolute gameClock day after which this location is flagged expired.
   * Opt-in — omitted on every location today, so nothing changes unless one is set. */
  deadlineDay?: number;
}

/** Attributes that can receive the three permanent points earned at every level-up. */
export type StatPointAttribute = "hp" | "atk" | "mag" | "def" | "res";
export type StatPointAllocation = Partial<Record<StatPointAttribute, number>>;

export interface Unit {
  id: string;
  name: string;
  classId: ClassId;
  className: string;
  role: string;
  side: Side;
  sprite: SpriteId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  res: number;
  /** Rolled once at battle start: 1d20 + the class initiative modifier. */
  initiative: number;
  initiativeRoll: number;
  /** Permanent player-chosen bonuses from level-up attribute points. Kept on the live unit
   * so swapping equipment or resuming a battle never erases them. */
  statPointAllocation: StatPointAllocation;
  mov: number;
  minRange: number;
  maxRange: number;
  moved: boolean;
  acted: boolean;
  facing: 1 | -1;
  walkPose: "front" | "back" | "side";
  alive: boolean;
  drawX: number;
  drawY: number;
  flash: number;
  /** 1 right when a unit levels up, decaying to 0 over a couple seconds — drives the golden
   * glow drawn around the sprite in render() (see levelUpUnit/spawnLevelUp). */
  levelGlow: number;
  /** Same idea as levelGlow but for receiving a beneficial effect — a heal spell landing or
   * a potion being drunk — drawn as a halo (see emitHolyFx / emitPotionZeroFx). Decays
   * independently of levelGlow so the two can overlap. */
  healGlow: number;
  /** Palette the healGlow halo uses: holy gold (minor/medium), disease teal, potion amber,
   * or Potionzero (the original warm-white glow, kept for future skills). */
  healGlowKind: "holyMinor" | "holyMedium" | "disease" | "potion" | "potionZero";
  fade: number;
  bob: number;
  level: number;
  /** XP toward the next level (0..EXP_TO_LEVEL-1). Player-only; always 0 for enemies. */
  xp: number;
  bag: Bag;
  spells: Spells;
  /** Equipped WeaponDef id, or null (player units start with the group's weakest weapon; enemies have none). */
  weaponId: string | null;
  /** Tabletop-style enhancement on the equipped weapon, 0..5. */
  weaponEnh: number;
  size: number;
  footprintW?: number;
  footprintH?: number;
  footprintOffsets?: { dx: number; dy: number }[];
  shock: { dice: number; faces: number; bonus: number } | null;
  /** Enemy-only Choque charges (weaker Relâmpago). Not a player tier — see shockChargesFor.
   * Distinct from `shock` above, which is Relâmpago's echo DoT. */
  shockCharges: number;
  diseased: boolean;
  diseaseBase: { atk: number; mag: number; def: number; res: number; mov: number } | null;
  /** Caustic Venom residue: 1D4 damage at the start of every one of this unit's own turns
   * (see startOfTurnEffects) until cured — same cure trigger as diseased (Cure Disease
   * spell or the disease potion), but no stat penalty of its own. */
  poisoned: boolean;
  /** Shield Bash victim: loses their entire next turn, then clears automatically. */
  stunned: boolean;
  /** How many of this unit's own upcoming turns `stunned` still eats — Shield Bash sets this
   * to 1, Trip (Lancer tier 3) to 2. Decremented each time it costs a turn; `stunned` only
   * clears once this reaches 0. */
  stunTurns: number;
  /** Trip (Lancer tier 3) victim: a permanent (this battle) −10% to ATK/MAG/DEF/RES/MOV,
   * applied once and never restored — unlike `diseased`, nothing cures it. */
  crippled: boolean;
  /** 0..0.9 — carried in from the party's overworld hunger streak at spawn (see Roster
   * and hungerPenaltyFor). Unlike `crippled`, this is re-applied every time reapplyGear
   * runs rather than mutated once, since — unlike a battle debuff — it reflects a save
   * value that can be current going into the next mission too, not something this
   * battle inflicts on itself. */
  hungerPenaltyPct: number;
  fullness: number;
  /** Equipped off-hand EquipmentDef id (kind "weapon" or "shield"), or null. */
  offHandId: string | null;
  /** Everything this unit is wearing, by slot. Carried on the unit (not just in the save)
   * so gear can change mid-battle and the stats that depend on it can be recomputed
   * without rebuilding the unit. See gearStatBonus. */
  gear: Partial<Record<EquipSlot, string>>;
  /** Summon Familiar (Conjurer tier 1): a player-side unit that doesn't count toward "any
   * hero still alive" for the defeat check or the playerAlive HUD figure — the party can't
   * survive a wipe on a pet alone. Everything else about it (selecting, moving, acting,
   * being targeted) works exactly like any other player unit. */
  summoned: boolean;
  /** Web of Dreams (Conjurer tier 2) victim: skips its own upcoming turns just like
   * `stunned`, but decrements on a separate counter (`sleepTurns`, set by a 1D4 roll) and
   * clears early — mid-round, not just at its own next turn — the instant it takes a hit,
   * which also applies that hit's `sleepBonusDamage` multiplier. */
  asleep: boolean;
  sleepTurns: number;
  /** Mirrors Spawn.guaranteedDrop — read once in markDead, never touched afterward. */
  guaranteedDrop: boolean;
  /** Mirrors Spawn.dialog — a unit carrying one is a talkable NPC: never an attack target
   * (see attackableByPlayer), and clicking it opens this tree instead of inspect. */
  dialog: DialogTree | null;
  /** Total path cost already spent moving this unit's own turn — reset once in
   * beginUnitTurn. Free repositioning (see effectiveUnitForReach) recomputes reach fresh
   * from wherever the unit currently stands after every move, which without this would
   * hand back a full, fresh `mov` budget each time and let a unit walk the length of the
   * map in hex-by-hex hops within a single turn; subtracting what's already been spent
   * caps the turn's real total distance at `mov`, same as it's always meant to be, while
   * still letting the player freely change their mind about WHERE within that budget to
   * end up (the actual point of free repositioning). */
  moveBudgetUsed: number;
}

export interface UnitPublic {
  id: string;
  name: string;
  classId: ClassId;
  className: string;
  role: string;
  side: Side;
  sprite: SpriteId;
  hp: number;
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  res: number;
  initiative: number;
  initiativeRoll: number;
  mov: number;
  /** Movement left this turn: MOV minus what has already been walked, clamped to 1 while
   * restrained. Movement is a pool the action does not cancel — spend two hexes, cast, and
   * the other three are still yours — so this is the number that actually matters in play,
   * and the panel counts it down instead of showing the untouched base all turn. */
  movLeft: number;
  minRange: number;
  maxRange: number;
  moved: boolean;
  acted: boolean;
  x: number;
  y: number;
  level: number;
  xp: number;
  bag: Bag;
  spells: Spells;
  weaponId: string | null;
  weaponEnh: number;
  size: number;
  diseased: boolean;
  poisoned: boolean;
  /** True once the party's hunger streak has passed its 3-day grace period. Optional so
   * older battle saves remain valid. */
  hungry?: boolean;
  /** 0..90 — the live stat penalty this unit is carrying from hunger, in percent. Only
   * meaningful alongside `hungry: true`; see hungerPenaltyFor in overworld.ts. */
  hungerPct?: number;
  fullness?: number;
  stunned: boolean;
  crippled: boolean;
  offHandId: string | null;
  summoned: boolean;
  asleep: boolean;
  /** True while this unit's current cell sits inside an active Web of Dreams zone — purely a
   * display flag; the movement penalty it implies is computed live off the zone, not stored. */
  restrained: boolean;
  /** Worn gear by slot — lets the status sheet explain which stats gear is boosting (see
   * gearStatBonus) and which specific piece is behind each one. */
  gear: Partial<Record<EquipSlot, string>>;
}

export interface WeaponDef {
  id: string;
  name: string;
  /** Classes (base and prestige) allowed to equip this weapon. */
  usableBy: ClassId[];
  dice: number;
  faces: number;
  bonus: number;
  price: number;
  /** Attack range, D&D-weapon-style — determined by the weapon itself, not the wielder's class. */
  minRange: number;
  maxRange: number;
  /** True for bow/crossbow-type weapons: grants the elevated-terrain range bonus (see effectiveMaxRange). */
  ranged?: boolean;
  /** Occupies both hands — an offHand item can't be equipped alongside it. */
  twoHanded?: boolean;
  /** The one class (of usableBy's pool, if it's a shared one) this weapon is thematically
   * tuned for — a staff named after a school of magic, say — and deals 10% more damage to
   * whoever wields it while actually being that class. Every other class in the pool can
   * still equip and use it at no penalty, just without the bonus. */
  bonusClass?: ClassId;
}

/**
 * Paper-doll equipment slots. "mainHand" isn't stored here — it's the existing weapon
 * system (SaveData.equipped/weapons). Every other slot is a bare skeleton for now: the
 * type and the UI exist, but EQUIPMENT in data.ts has no items in it yet.
 */
export type EquipSlot =
  | "head"
  | "neck"
  | "shoulders"
  | "back"
  | "chest"
  | "hands"
  | "waist"
  | "legs"
  | "feet"
  | "ring1"
  | "ring2"
  | "offHand";

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  /** Classes (base and prestige) allowed to equip this item. Empty/omitted = any class. */
  usableBy?: ClassId[];
  hp?: number;
  atk?: number;
  mag?: number;
  def?: number;
  res?: number;
  mov?: number;
  price?: number;
  /** offHand-slot items only: "weapon" grants an off-hand attack command (using this
   * item's own dice/range below); "shield" grants Shield Bash instead (this shield's own
   * dmgMul, 70% chance to stun for the target's next turn). Both show as the command menu's
   * first option, and both are blocked while the main hand holds a WeaponDef.twoHanded
   * weapon. */
  kind?: "weapon" | "shield";
  dice?: number;
  faces?: number;
  bonus?: number;
  minRange?: number;
  maxRange?: number;
  /** Shield Bash's damage multiplier for this specific shield — stronger shields close the
   * gap toward 1 (no penalty at all on the best ones), instead of one flat rate for every
   * shield. */
  dmgMul?: number;
}

export interface Forecast {
  attacker: string;
  defender: string;
  dmgOut: number;
  dmgBack: number;
  /** Chance (0-100) the outgoing hit / the counter lands — see combat.ts's
   * physicalHitChance/magicalHitChance. */
  hitOut: number;
  hitBack: number;
  canCounter: boolean;
  critOut: boolean;
  kill: boolean;
}

export interface TerrainHover {
  id: TerrainId;
  name: string;
  /** Movement points entering this tile costs. Only meaningful when `passable`. */
  moveCost: number;
  def: number;
  atk: number;
  passable: boolean;
  /** True when the tile stops shots and line of sight. */
  blocksShot: boolean;
  hazard?: string;
  note?: string;
  /** A persistent spell zone covering this tile. When present, inspection presents the
   * zone instead of the underlying terrain rules. */
  spellZone?: {
    kind: "webOfDreams";
    roundsLeft: number;
    movementCap: number;
    sleepChance: number;
    sleepDice: string;
  };
}

export interface HudSnapshot {
  phase: Phase;
  banner: string | null;
  selected: UnitPublic | null;
  hoveredUnit: UnitPublic | null;
  terrain: TerrainHover | null;
  mode: InputMode;
  canAttack: boolean;
  /** Selected unit has an unused offHand item and could still act — "weapon" for an
   * off-hand attack command, "shield" for Shield Bash, null when neither applies. */
  offHandKind: "weapon" | "shield" | null;
  canLockpick: boolean;
  forecast: Forecast | null;
  turn: number;
  objective: string;
  missionTitle: string;
  playerAlive: number;
  enemyAlive: number;
  busy: boolean;
  result: "victory" | "defeat" | null;
  winAvailable: boolean;
  /** Whether the movement taken this turn can still be taken back — see canUndoMove. */
  canUndoMove: boolean;
  /** For a spell that picks more than one target (Magic Missile at level 3+), how many it
   * wants and how many are already chosen. Null when nothing is waiting on a pick. */
  targetPrompt: { name: string; need: number; picked: number } | null;
  zoom: number;
  speedMode: "normal" | "fast";
  tip: string | null;
  inspected: UnitPublic | null;
  pendingFoe: UnitPublic | null;
  spellReady: boolean;
  spellKind: SpellKind | null;
  /** Battle turn order (both sides mixed), highest opening initiative first. */
  turnQueue: { id: string; name: string; side: Side; acted: boolean; active: boolean; initiative: number }[];
  /** Rolling combat log — attacks, spells, heals, kills, loot — newest last. */
  log: string[];
  /** Set the instant a chest is opened, cleared only when the player dismisses the popup
   * (see acknowledgeChestLoot) — not a transient "just happened" flag like tip, so it
   * survives sitting on screen until the player actually reads it. */
  chestLoot: { unitName: string; ember: number; items: { name: string; icon: string; tip?: string }[] } | null;
  /** Set the instant a dialog-bearing NPC is clicked, cleared only via acknowledgeDialog —
   * same "sits until dismissed" convention as chestLoot above. */
  pendingDialog: DialogTree | null;
}

export interface WalkDirs {
  front: HTMLImageElement;
  back: HTMLImageElement;
  side: HTMLImageElement;
}

export interface GameArt {
  /** Every art variant for a terrain type, e.g. tiles.plains[0]/[1] — index 0 is the
   * default (what existing missions render with when a tile doesn't name a variant). */
  tiles: Record<TerrainId, HTMLImageElement[]>;
  /** Multi-hex decoration art, keyed by DecorationDef.id. */
  decorations: Record<string, HTMLImageElement>;
  sprites: Record<SpriteId, HTMLImageElement[]>;
  attacks: Partial<Record<SpriteId, HTMLImageElement[]>>;
  /** A distinct pose for casting a spell, for the few sprites that have one cut — falls back
   * to `attacks` (the melee swing) for every sprite without one, same as it always did. */
  casts: Partial<Record<SpriteId, HTMLImageElement[]>>;
  /** Walk cycles, for the sprites that have one cut. Played only while a unit is actually
   * moving; a sprite without one keeps falling back to its idle loop run faster, which is
   * what every sprite did before walk cycles existed. */
  walks: Partial<Record<SpriteId, HTMLImageElement[]>>;
  /** Optional left-facing walk/attack cuts. A sprite with these skips the scale-flip while
   * moving or striking and plays this set when facing === -1 (the right-facing set lives in
   * `walks` / `attacks`). Idle still uses the shared 12-frame sheet and the regular flip. */
  walksLeft: Partial<Record<SpriteId, HTMLImageElement[]>>;
  attacksLeft: Partial<Record<SpriteId, HTMLImageElement[]>>;
  /** Left-facing counterpart to `casts`, for the sprites that have one cut. Falls back to
   * `casts` (mirrored via the regular flip) for every sprite without one. */
  castsLeft: Partial<Record<SpriteId, HTMLImageElement[]>>;
  /** A distinct pose for the defender's own counter-attack stages (counterLunge/Hit/
   * Recover), for the few sprites that have one cut — falls back to `attacks` (the same
   * swing used for a normal attack) for every sprite without one, same as it always did
   * before this existed. */
  counters: Partial<Record<SpriteId, HTMLImageElement[]>>;
  /** Left-facing counterpart to `counters`. Falls back to `counters` (mirrored via the
   * regular flip) for every sprite without one. */
  countersLeft: Partial<Record<SpriteId, HTMLImageElement[]>>;
  idles: Partial<Record<SpriteId, HTMLImageElement[]>>;
  walkDirs: Partial<Record<SpriteId, WalkDirs>>;
  impact: HTMLImageElement[];
  /** Ultra-realistic Fireball core; its trail and light remain procedural. */
  fireballCore: HTMLImageElement;
  /** Ultra-realistic Caustic Venom core. */
  causticVenomCore: HTMLImageElement;
  /** Ultra-realistic travelling arrow. */
  arrowCore: HTMLCanvasElement;
  /** Photoreal Relâmpago cores (flicker set). Additive-blend on black. */
  lightningCores: HTMLImageElement[];
  /** Optional full-canvas backdrop, keyed by mission id. */
  backdrops: Record<string, HTMLImageElement>;
}

export interface BattleUnitSnap {
  id: string;
  name: string;
  classId: ClassId;
  side: Side;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  res: number;
  /** Optional for compatibility with saves made before individual initiative existed. */
  initiative?: number;
  initiativeRoll?: number;
  /** Optional for compatibility with battle saves created before attribute points existed. */
  statPointAllocation?: StatPointAllocation;
  mov: number;
  minRange: number;
  maxRange: number;
  moved: boolean;
  acted: boolean;
  facing: 1 | -1;
  alive: boolean;
  fade: number;
  level: number;
  xp: number;
  bag: Bag;
  spells: Spells;
  weaponId: string | null;
  weaponEnh: number;
  shock: { dice: number; faces: number; bonus: number } | null;
  /** Enemy-only Choque charges. Distinct from `shock` (Relâmpago echo DoT). */
  shockCharges: number;
  diseased: boolean;
  diseaseBase: { atk: number; mag: number; def: number; res: number; mov: number } | null;
  poisoned: boolean;
  stunned: boolean;
  stunTurns: number;
  crippled: boolean;
  /** Optional for compatibility with battle saves created before hunger existed. */
  hungerPenaltyPct?: number;
  fullness?: number;
  offHandId: string | null;
  gear: Partial<Record<EquipSlot, string>>;
  summoned: boolean;
  asleep: boolean;
  sleepTurns: number;
  guaranteedDrop: boolean;
  dialog: DialogTree | null;
  moveBudgetUsed: number;
}

export interface BattleSnapshot {
  missionId: string;
  turn: number;
  phase: Phase;
  units: BattleUnitSnap[];
  tiles: TerrainId[];
  decorations: DecorationPlacement[];
  turnOrder: string[];
  activeUnitId: string | null;
  selectedId: string | null;
  lootEmber: number;
  /** Optional for compatibility with battle saves created before ration loot existed. */
  lootRations?: number;
  lootWeapons: string[];
  lootEquipment: string[];
  ownedWeapons: string[];
  webZones: { cells: string[]; roundsLeft: number }[];
  auraZones: { cells: string[]; roundsLeft: number; kind: "protection" | "intimidation"; side: Side; pct: number }[];
  log: string[];
  winAvailable: boolean;
  chestLoot: { unitName: string; ember: number; items: { name: string; icon: string; tip?: string }[] } | null;
  pendingDialog: DialogTree | null;
  turnRestrained: boolean;
  /** True when beginUnitTurn already ran for the current actor — load must not re-apply
   * start-of-turn echo/poison/stun. False when the next unit hasn't opened their turn yet. */
  turnBegan: boolean;
  /** Which cells the party has seen, one bit each, row-major, base64. Only written on
   * a mission under fog; absent everywhere else, and absent reads as "nothing seen
   * yet", which is also the right answer for a save made before fog existed since no
   * such save can be of a fogged mission. What is currently *visible* is never stored
   * — it falls out of where the party stands, so load recomputes it. */
  explored?: string;
  /** Ids of foes that have already spotted the party, so an alerted enemy stays
   * alerted across a save. Only written under fog; absent reads as none awake. */
  awake?: string[];
}

export interface SaveData {
  version: number;
  completed: string[];
  unitHp: Record<string, number>;
  levels: Record<string, number>;
  xp: Record<string, number>;
  /** Hero name → permanent point allocation. Every level after level 1 grants three points. */
  statPointAllocations: Record<string, StatPointAllocation>;
  bags: Record<string, Bag>;
  /** Hero name → promoted ClassId chosen at PROMOTE_LEVEL. Unset until the player picks. */
  promotions: Record<string, ClassId>;
  /** Owned WeaponDef id → enhancement level (0..5). Presence in the map means it's owned. */
  weapons: Record<string, number>;
  /** Hero name → equipped WeaponDef id. */
  equipped: Record<string, string>;
  /** Hero name → slot → equipped EquipmentDef id. */
  equipment: Record<string, Partial<Record<EquipSlot, string>>>;
  /** Owned but unassigned EquipmentDef id → count — the party's shared gear stash. Loot
   * lands here first (never auto-equipped onto whoever found it); the player assigns it to
   * a hero from the Paperdoll picker, same as the weapon pool already works. */
  looseEquipment: Record<string, number>;
  /** Hero name → tier key → spell uses spent so far in the current scenario (a world-map
   * location's whole run of missions) — carried between missions within one location so
   * charges don't refill until that scenario ends. Cleared back to {} whenever a mission
   * starts a fresh scenario (see startBattle in GameApp.tsx); Stone Bridge always resets,
   * being the tutorial. */
  spellUses: Record<string, Partial<Record<TierKey, number>>>;
  ember: number;
  emberSeeded: boolean;
  muted: boolean;
  updatedAt: number;
  pendingMission: string | null;
  /** Mid-battle board: set by Save during a fight so Load resumes that combat instead of
   * restarting it from the briefing. Cleared on victory, defeat, or a fresh mission start. */
  battle: BattleSnapshot | null;
  /** The Vargan forge intro has played for this party. Absent reads as not yet seen. */
  seenSmithIntro?: boolean;
  /** The movement/hunger explainer, shown once the first time the RPG overworld map
   * screen opens for this party. Absent reads as not yet seen. */
  seenOverworldIntro?: boolean;
  /** RPG map only: current hex position and day count. Unused by the classic map. */
  overworldPos: { col: number; row: number };
  gameClock: number;
  /** RPG map only: every hex ("col,row") the party has ever stood on — drives the fog of
   * war (see OverworldMapScreen): a location pin other than the Inn only shows once its
   * hex is in here, and the dark overlay clears in a radius around each one. Grows,
   * never shrinks — nothing un-explores a hex once seen. */
  exploredHexes: string[];
  /** Cumulative travel cost; each adjacent step costs one, including backtracking. */
  overworldMoveBudgetUsed: number;
  /** Fullness remaining per hero (0..120). Missing heroes start full. */
  heroHunger: Record<string, number>;
  /** Overworld illnesses persist between travel and battles until cured with a disease
   * potion or the Curar Doença spell. Missing heroes are healthy for old saves. */
  heroDiseases: Record<string, boolean>;
  /** Party-wide ration stock. One ration refills one character's fullness to 100%; inn
   * meals are bought separately. A real backpack item that stacks by RATION_STACK_MAX. */
  rations: number;
  /** Consecutive days the party went unfed on the RPG map (0 = fine). Drives the Hungry
   * status once past the 3-day grace period — see hungerPenaltyFor in overworld.ts.
   * Resets to 0 the moment rations flow again or the party reaches an Inn. */
  hungerStreak: number;
}

export interface SaveBank {
  version: number;
  lastSlot: number;
  muted: boolean;
  slots: Array<SaveData | null>;
}

export interface GrowthLine {
  name: string;
  from: number;
  to: number;
  hpBattle: number;
  maxFrom: number;
  restHp: number;
  levelHp: number;
  hpCamp: number;
  maxTo: number;
  powerFrom: number;
  powerTo: number;
  powerKind: "AT" | "MAG";
  atkFrom: number;
  atkTo: number;
  magFrom: number;
  magTo: number;
  defFrom: number;
  defTo: number;
  resFrom: number;
  resTo: number;
  fallen: boolean;
  /** XP toward the next level at the end of the mission (0..EXP_TO_LEVEL-1). */
  xp: number;
  /** XP toward the level shown by `xp` at mission start — the ResultScreen's XP bar
   * animates from here up to `xp` rather than snapping straight to the final value. Only
   * meaningful (nonzero) when `to === from`; a level-up resets it to 0 since the bar is now
   * tracking progress in a different level than the one `xpFrom` would describe. */
  xpFrom: number;
  /** Extra spell uses this level-up granted (e.g. "+1 T1 · +1 T2"). Empty when the new
   * level didn't add slots — spent charges are never refilled, only new slots land. */
  skillGain?: string;
}
