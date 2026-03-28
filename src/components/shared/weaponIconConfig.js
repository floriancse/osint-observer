import { 
  GiRocket, 
  GiLandMine, 
  GiWarningSign, 
  GiCannon, 
  GiDrone, 
  GiMissileLauncher,
  GiTargetLaser,
  GiBomber,
  GiSiren,
  GiCrosshair,
  GiExplosionRays
} from 'react-icons/gi';

import { IoIosWarning } from "react-icons/io";
import { TbDrone } from "react-icons/tb";
import { SiBombardier } from "react-icons/si";
import { FaExplosion } from "react-icons/fa6";
import { GiAk47,GiBombingRun, GiConvergenceTarget, GiArtilleryShell } from "react-icons/gi";
import { FaLandMineOn, FaGun } from "react-icons/fa6";
import { BiSolidBomb, BiTargetLock } from "react-icons/bi";

export const WEAPON_ICON_CONFIG = {
    'Mine': { icon: FaLandMineOn, props: { size: 24 } },
    'Unidentified weapon': { icon: IoIosWarning, props: { size: 24 } },
    'Drone': { icon: TbDrone, props: { size: 24 } },
    'Bombing / airstrike': { icon: GiArtilleryShell, props: { size: 24 } },
    'Ballistic missile': { icon: BiTargetLock, props: { size: 24 } },
    'Gunfire / small arms': { icon: FaGun, props: { size: 24 } },
};
