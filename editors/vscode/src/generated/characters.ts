/* GENERATED FILE - DO NOT EDIT.
 * Source: shared/characters/characters.json
 * Run: python tools/generate_characters.py --write
 */

export interface GeneratedAnimationDefinition {
	readonly frames: readonly number[];
	readonly frameDurationMs: number;
	readonly loops: number;
	readonly holdLastFrameMs: number;
}

export interface GeneratedCharacterDefinition {
	readonly id: string;
	readonly name: string;
	readonly variant: string;
	readonly enabledByDefault: boolean;
	readonly assetDirectory: string;
	readonly spriteSheet: string;
	readonly framesDirectory: string;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly frameCount: number;
	readonly defaultDisplayHeight: number;
	readonly manualText: string;
	readonly animations: {
		readonly idle: GeneratedAnimationDefinition;
		readonly blink: GeneratedAnimationDefinition;
		readonly special: GeneratedAnimationDefinition;
		readonly spin: GeneratedAnimationDefinition;
	};
	readonly behavior: {
		readonly motion: {
			readonly enabled: boolean;
			readonly mode: string;
			readonly idleOnly: boolean;
			readonly amplitudePx: number;
			readonly durationMs: number;
			readonly minIntervalMs: number;
			readonly maxIntervalMs: number;
		};
		readonly randomSpecial: {
			readonly enabled: boolean;
			readonly minimumIdleMs: number;
			readonly minIntervalMs: number;
			readonly maxIntervalMs: number;
		};
		readonly randomSpin: {
			readonly enabled: boolean;
			readonly minimumIdleMs: number;
			readonly minIntervalMs: number;
			readonly maxIntervalMs: number;
		};
	};
}

export const CHARACTER_DEFINITIONS =
	[
  {
    "id": "youmu",
    "name": "Youmu Konpaku",
    "variant": "standard",
    "enabledByDefault": true,
    "assetDirectory": "youmu",
    "spriteSheet": "youmu-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 101,
    "frameHeight": 95,
    "frameCount": 11,
    "defaultDisplayHeight": 95,
    "manualText": "Myon!",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [
          0,
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "frameDurationMs": 90,
        "loops": 3,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  },
  {
    "id": "koishi",
    "name": "Koishi Komeiji",
    "variant": "standard",
    "enabledByDefault": true,
    "assetDirectory": "koishi",
    "spriteSheet": "koishi-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 84,
    "frameHeight": 103,
    "frameCount": 11,
    "defaultDisplayHeight": 103,
    "manualText": "Do you see me?",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [
          0,
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "frameDurationMs": 90,
        "loops": 3,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  },
  {
    "id": "reimu",
    "name": "Reimu Hakurei",
    "variant": "standard",
    "enabledByDefault": true,
    "assetDirectory": "reimu",
    "spriteSheet": "reimu-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 118,
    "frameHeight": 112,
    "frameCount": 11,
    "defaultDisplayHeight": 112,
    "manualText": "Donate plz",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [
          0,
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "frameDurationMs": 90,
        "loops": 3,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  },
  {
    "id": "seija",
    "name": "Seija Kijin",
    "variant": "standard",
    "enabledByDefault": false,
    "assetDirectory": "seija",
    "spriteSheet": "seija-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 86,
    "frameHeight": 94,
    "frameCount": 4,
    "defaultDisplayHeight": 94,
    "manualText": "Reverse!",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [],
        "frameDurationMs": 120,
        "loops": 1,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  },
  {
    "id": "sanae",
    "name": "Sanae Kochiya",
    "variant": "standard",
    "enabledByDefault": false,
    "assetDirectory": "sanae",
    "spriteSheet": "sanae-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 97,
    "frameHeight": 104,
    "frameCount": 4,
    "defaultDisplayHeight": 104,
    "manualText": "A miracle!",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [],
        "frameDurationMs": 120,
        "loops": 1,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  },
  {
    "id": "reimu_lost_word",
    "name": "Reimu Hakurei — Lost Word",
    "variant": "lost-word",
    "enabledByDefault": false,
    "assetDirectory": "reimu_lost_word",
    "spriteSheet": "reimu_lost_word-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 112,
    "frameHeight": 112,
    "frameCount": 4,
    "defaultDisplayHeight": 112,
    "manualText": "Fantasy Nature!",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [],
        "frameDurationMs": 120,
        "loops": 1,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  },
  {
    "id": "mokou",
    "name": "Fujiwara no Mokou",
    "variant": "standard",
    "enabledByDefault": false,
    "assetDirectory": "mokou",
    "spriteSheet": "mokou-sheet.png",
    "framesDirectory": "frames",
    "frameWidth": 72,
    "frameHeight": 110,
    "frameCount": 11,
    "defaultDisplayHeight": 110,
    "manualText": "This is fine",
    "animations": {
      "idle": {
        "frames": [
          0
        ],
        "frameDurationMs": 1000,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "blink": {
        "frames": [
          1
        ],
        "frameDurationMs": 170,
        "loops": 1,
        "holdLastFrameMs": 0
      },
      "special": {
        "frames": [
          2,
          3
        ],
        "frameDurationMs": 450,
        "loops": 2,
        "holdLastFrameMs": 500
      },
      "spin": {
        "frames": [
          0,
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "frameDurationMs": 90,
        "loops": 3,
        "holdLastFrameMs": 0
      }
    },
    "behavior": {
      "motion": {
        "enabled": true,
        "mode": "occasional-hop",
        "idleOnly": true,
        "amplitudePx": 3,
        "durationMs": 550,
        "minIntervalMs": 25000,
        "maxIntervalMs": 70000
      },
      "randomSpecial": {
        "enabled": true,
        "minimumIdleMs": 20000,
        "minIntervalMs": 60000,
        "maxIntervalMs": 180000
      },
      "randomSpin": {
        "enabled": false,
        "minimumIdleMs": 60000,
        "minIntervalMs": 180000,
        "maxIntervalMs": 420000
      }
    }
  }
] as const satisfies
	readonly GeneratedCharacterDefinition[];
