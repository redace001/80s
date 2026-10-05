/* ============================================================
   THE 80s CRUISE - DECK RUNNER
   A retro auto-runner. Responsive for phone + desktop.
   Internal render height is locked at 180px; width flexes to the
   screen aspect so it fills any device without stretching pixels.

   Decks (levels): New Wave -> Synthwave -> Hair Metal -> Freestyle
   -> Power Ballad. Advances every 25s, each with its own palette,
   music vibe and difficulty.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  var BASE_H = 180;
  var VW = 320;
  var VH = BASE_H;
  var groundY = VH - 30;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------- responsive canvas (letterbox-aware) ---------- */
  function resize() {
    var aspect = window.innerWidth / window.innerHeight;
    VW = clamp(Math.round(BASE_H * aspect), 200, 620);
    VH = BASE_H;
    canvas.width = VW;
    canvas.height = VH;
    groundY = VH - 30;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = 'top';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 250);
  });

  /* ---------- palette (pulled from the two cruise images) ---------- */
  var C = {
    outline: '#14151f',
    pink: '#ff4fa0',
    pinkDark: '#c8327c',
    yellow: '#ffd500',
    blue: '#1b4fd8',
    blueDark: '#122f86',
    navy: '#1a1f5c',
    navyDeep: '#0b0e2a',
    red: '#e63946',
    white: '#ffffff',
    skin: '#ffcf9e',
    cyan: '#4fe3ff',
    purple: '#7b2ff7',
    teal: '#12c2a0'
  };

  /* ---------- tiny pixel-sprite builders ---------- */
  function makeSprite(rows, map) {
    var w = rows[0].length;
    var h = rows.length;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      var row = rows[y];
      for (var x = 0; x < w; x++) {
        var ch = row.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var col = map[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function buildSprite(baseRows, legRows, map) {
    return makeSprite(baseRows.concat(legRows), map);
  }

  function circleSprite(r, color) {
    var d = r * 2 + 1;
    var c = document.createElement('canvas');
    c.width = d;
    c.height = d;
    var g = c.getContext('2d');
    g.fillStyle = color;
    for (var y = 0; y < d; y++) {
      for (var x = 0; x < d; x++) {
        var dx = x - r, dy = y - r;
        if (dx * dx + dy * dy <= r * r) g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  /* ---------- player sprite sheet: 4-frame run + jump + fall ---------- */
  var runnerMap = {
    '1': C.outline, '2': C.yellow, '3': C.skin, '4': C.pink,
    '5': C.blue, '6': C.red, '8': C.navy
  };

  /* shared upper body (head, hair, shades, neon windbreaker) */
  var RUN_BODY = [
    '....1111....',
    '...122221...',
    '..12222221..',
    '..12833281..',
    '..12333321..',
    '...133331...',
    '..14444441..',
    '.1444444441.',
    '.1344444431.',
    '..14444441..',
    '..15555551..'
  ];

  var LEG_A = [ /* wide stride */
    '..1555.5551.',
    '.15551.1551.',
    '.1551..1551.',
    '.1661..1661.',
    '.111...111..'
  ];
  var LEG_B = [ /* trailing leg passing */
    '..1555.5551.',
    '...155.5551.',
    '...155..1551',
    '...166..1661',
    '...11..111..'
  ];
  var LEG_C = [ /* crossed stride */
    '..15555551..',
    '.15551.15551',
    '.1551..1551.',
    '.1661..1661.',
    '.111...111..'
  ];
  var LEG_D = [ /* lead leg passing */
    '..15555551..',
    '...15555551.',
    '...1551.1551',
    '...1661.1661',
    '...111..111.'
  ];
  var LEG_JUMP = [ /* knees tucked up */
    '..15555551..',
    '.1555..5551.',
    '.1551..1551.',
    '..11....11..',
    '............'
  ];
  var LEG_FALL = [ /* legs reaching down */
    '..15555551..',
    '..1555.5551.',
    '.1551..1551.',
    '.1661..1661.',
    '.111...111..'
  ];

  var playerFrames = {
    run: [
      buildSprite(RUN_BODY, LEG_A, runnerMap),
      buildSprite(RUN_BODY, LEG_B, runnerMap),
      buildSprite(RUN_BODY, LEG_C, runnerMap),
      buildSprite(RUN_BODY, LEG_D, runnerMap)
    ],
    jump: buildSprite(RUN_BODY, LEG_JUMP, runnerMap),
    fall: buildSprite(RUN_BODY, LEG_FALL, runnerMap),
    /* crouched low - used when ducking under high birds (hard mode) */
    duck: makeSprite([
      '....1111....',
      '...122221...',
      '..12833281..',
      '..12333321..',
      '.1444444441.',
      '.1344444431.',
      '.1555555551.',
      '.1555..5551.',
      '.1661..1661.',
      '.111....111.'
    ], runnerMap)
  };

  /* ---------- obstacle + pickup sprites ----------
     Obstacles are authored in 3/4 view. Rows were generated and
     visually verified offline; each char maps through OB_MAP.
     >>> SPRITES:START (generated by spritegen.js - do not hand edit) <<< */
  var OB_MAP = {
    '1': '#14151f', '2': '#ffffff', '3': '#ff4fa0', '4': '#c8327c',
    '5': '#9aa4b2', '6': '#5b6472', '7': '#1b4fd8', '8': '#122f86',
    '9': '#ffd500', 'a': '#ffcf9e', 'b': '#e63946', 'c': '#e7c79c',
    'd': '#b98c5a', 'e': '#3fa63f', 'f': '#1f6b1f', 'g': '#7fd07f',
    'h': '#7a5230', 'i': '#5c3d22', 'j': '#cfe0f2', 'k': '#a9c8ea'
  };

  /* deck chair / sun lounger (white frame, blue/white stripes) */
  var chairSprite = makeSprite([
    '...1111111111...................',
    '...1222222221...................',
    '...1272227721...................',
    '...1272227721...................',
    '....1222277721..................',
    '....1222277721..................',
    '.....1222777221.................',
    '.....1222211111111111111111111..',
    '.....1111111111222222222222122..',
    '..........12222777222777222222..',
    '.........127222777222777222122..',
    '.........127222777222777222122..',
    '........1277222777222777221.22..',
    '........1277222777222777221.22..',
    '.......1277722277722277721..22..',
    '......11122222222222222211..22..',
    '......12211111111111111122.122..',
    '.......22...............22......',
    '......122..............122......',
    '................................'
  ], OB_MAP);

  /* wooden shipping crate */
  var crateSprite = makeSprite([
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '.......111111111111111111.',
    '......1cccccccccccccccc11.',
    '.....1cccccccccccccccc1d1.',
    '....1cccccccccccccccc1dd1.',
    '...111111111111111111ddd1.',
    '...1dccccccccccccccd1ddd1.',
    '...1cdccccccccccccdc1ddd1.',
    '...1dddddddddddddddd1ddd1.',
    '...1cccddccccccddccc1ddd1.',
    '...1cccccdccccdccccc1ddd1.',
    '...1ccccccdccdcccccc1ddd1.',
    '...1dddddddddddddddd1ddd1.',
    '...1cccccccddccccccc1ddd1.',
    '...1ccccccdccdcccccc1ddd1.',
    '...1cccccdccccdccccc1ddd1.',
    '...1dddddddddddddddd1ddd1.',
    '...1ccdccccccccccdcc1dd1..',
    '...1cdccccccccccccdc1d1...',
    '...1dccccccccccccccd11....',
    '...111111111111111111.....'
  ], OB_MAP);

  /* seagull (wings swept up) */
  var gullSprite = makeSprite([
    '..........................',
    '..........1.....1111......',
    '......11111.....155.......',
    '.......66661....155.......',
    '........66661..15511......',
    '.........66661.151221.....',
    '.1.....111222215122121....',
    '..5...12222222151222219991',
    '..15.1222222222221221.....',
    '..155122222222222211......',
    '..151.122222222221........',
    '..11...1112222111.........',
    '..........................',
    '..........................',
    '..........................',
    '..........................'
  ], OB_MAP);

  /* distant cruise ship (background, sails by) */
  var shipSprite = makeSprite([
    '..................................................................88888888888888..................................................',
    '............................................222222222222222222....88888888888888..................................................',
    '............................................222222222222222222....88888888888888..................................................',
    '............................................222222222222222222....bbbbbbbbbbbbbb..................................................',
    '............................................222222222222222222....bbbbbbbbbbbbbb..................................................',
    '........................................22222222222222222222222222bbbbbbbbbbbbbb2222..............................................',
    '........................................22228882222888222288822228888888888888888822..............................................',
    '........................................22228882222888222288822228888888888888888822..............................................',
    '........................................22222222222222222222222222888888888888882222..............................................',
    '........................................22222222222222222222222222888888888888882222..............................................',
    '............................222222222222222222222222222222222222228888888888888822222222222222222222222222........................',
    '............................222222222222222222222222222222222222222222222222222222222222222222222222222222........................',
    '............................222288882228888222888822288882228888222888822288882228888222888822288882222222........................',
    '............................222288882228888222888822288882228888222888822288882228888222888822288882222222........................',
    '............................222288882228888222888822288882228888222888822288882228888222888822288882222222........................',
    '............................222222222222222222222222222222222222222222222222222222222222222222222222222222........................',
    '............................222222222222222222222222222222222222222222222222222222222222222222222222222222........................',
    '..................1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111...............',
    '..................122222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222................',
    '..................122288882228888222888822288882228888222888822288882228888222888822288882228888222888822288882222................',
    '..................122288882228888222888822288882228888222888822288882228888222888822288882228888222888822288882222................',
    '..................122288882228888222888822288882228888222888822288882228888222888822288882228888222888822288882222................',
    '..................122222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222................',
    '..................122222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222................',
    '..................122222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222................',
    '......1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111.........',
    '......12222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222........',
    '......122222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222.......',
    '......1222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222......',
    '......122222111222222111222222111222222111222222111222222111222222111222222111222222111222222111222222111222222111222222222222....',
    '......1222221112222221112222221112222221112222221112222221112222221112222221112222221112222221112222221112222221112222222222222...',
    '......12222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222..',
    '......1222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222228',
    '......1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb88888888..',
    '......1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb8888888...',
    '......188888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888....',
    '......1888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888......',
    '......188888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888.......',
    '......18888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888........',
    '......1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111.........',
    '..................................................................................................................................',
    '..................................................................................................................................',
    '..................................................................................................................................',
    '..................................................................................................................................'
  ], OB_MAP);

  /* tropical island (background) */
  var islandSprite = makeSprite([
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '........................................................................................................................',
    '..................................................................................ffffff................................',
    '..........................................ffffff...................................fffff....e...........................',
    '...........................................fffff....e..............................fffff....e...........................',
    '...........................................fffff....e...............................ffff...eee..........................',
    '............................................ffff...eee..............................fffff.eeeee.ffffff..................',
    '..................ffffff..................eefffffeeeeeeeeeeeeeeeee...................ffffeeeeeee.fffff....e.............',
    '...................fffff....e.....eeeeeeeeeeeffffeeeeeeeeeeeeeeeeeeeeeeeeefffefffffffffffeeeeeee.fffff....e.............',
    '...................fffff....eeeeeeeeeeeeeeeeeffffeeeeeeeeeeeeeeeeeeefffffffffeeeefffffffeeeeeeee..ffff...eee............',
    '....................ffff.eeeeeeeeeeeeeeeeeeeeeffeeeeeeeeeeeeeeeefffffffffffffeeeeeeefffeeeeeeeeefffffff.eeeee...........',
    '....................fffffeeeeeeeeeeeeeeeeeeeeefeeeeeeeeeeeeeeeffffbffffffffffeeeeeeeeeeeeeeeeeeefffffffeeeeeee..........',
    '....................effffeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeffffffbbbffffffffeeeeeeeeeeheeeeeeeeeeffffffeeeeeee..........',
    '.............e....eeeffffeeeeeeeeeeeeeeeeeeeeeheeeeeeeeeeefffffbbbbbbbfffffffffffeeeeiheeeeeeeefffffffeeeeeeee..........',
    '.............eeeeeeeeeffeeeeeeeeeeeeeeeeeeeeeiheeeeeeeeeffffffbbbbbbbbbfffffffffffffffhifffeeeeeeefffeeeeeeeee..........',
    '.............eeeeeeeeefeeeeeeeeeeeeeeeeeeeeeeehieeeeeeefffffbbbbbbbbbbbbbffffffffffffhiffffeeeeeeeeeeeeeeeeeee..........',
    '.............eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeehieeeeeeeefffffddddddddddddfffffffffffffhifffeeeeeeeeeeheeeeeeeeee.........',
    '............eeeeeeeeeeheeeeeeeeeeeeeeeeeeeeeehieeeeeeeffffffddddddddddddfffffffffffffhiffffffffeeeeiheeeeeffff..........',
    '............eeeeeeeeeiheeeeeeeeeeeeeeeeeeeeeehieeeeeeeefffffddddddddddddfffffffffffffhifffffffffffffhiffffffff..........',
    '............eeeeeeeeeehieeeeeeeeeeeeeeeeeeeeehieeeeeeeeeffffddddddddddddfffffffffffffhiffffffffffffhifffffffff..........',
    '............eeeeeeeeehieeeeeeeeeeeeeeeeeeeeeehieeeeeeeeeffffddddddddddddfffffffffffffhiffffffffffffhifffffffff..........',
    '............eeeeeeeeehieeeeeeeeeeeeeeeeeeeeeehieeeeeeeeeffffddddddddddddfffffffffffffhiffffffffffffhiffffffff...........',
    '............eeeeeeeeehieeeeeeeeeeeeeeeeeeeeeehieeeeeeeeefffffffffffffffffffffffffffffhiffffffffffffhiffffffff...........',
    '.............eeeeeeeehieeeeeeeeeeeeeeeeeeeeeehieeeeeeeeeffffffffffffffffffffffffffffhifffffffffffffhifffffff............',
    '..............eeeeeeehieeeeeeeeeeeeeeeeeeeeehieeeeeeeeeeeeffffffffffffffffffffffffffhifffffffffffffhifffffccccc.........',
    '...............eeeeeehieeeeeeeeeeeeeeeeeeeeehieeeeeeeeeeeeefffffffffffffffffffffffffhifffffffffffffhiffffccccccc........',
    '..............ccceeeehieeeeeeeeeeeeeeeeeeeeehieeeeeeeeeeeeeeeeffffffffffffffffffffffhifffffffffffffhifccccccccccc.......',
    '..........ccccccccceehieeeeeeeeeeeeeeeeeeeeehieeeeeeeeeeeeeeeeeeffffffffffffffffffffhiffffffffffffhicccccccccccccc......',
    '......cccccccccccccchieeeeeeeeeeeeeeeeeeeeeehieeeeeeeeeeeeeeeeeeeeeeffffffffffffffffffffffffffffcchiccccccccccccccc.....',
    '.....ccccccccccccccchiccceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeffffffffffffffffcccccccchicccccccccccccccc....',
    '....cccccccccccccccchiccccccceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeccccccccccccccccccchiccccccccccccccccc...',
    '...ccccccccccccccccchicccccccccccceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeecccccccccccccccccccccccchicccccccccccccccccc..',
    '..cccccccccccccccccchicccccccccccccccccccceeeeeeeeeeeeeeeeeeeeeeeeccccccccccccccccccccccccccccccccccccccccccccccccccccc.',
    '........................................................................................................................'
  ], OB_MAP);

  /* cloud: big cumulus */
  var cloudASprite = makeSprite([
    '................................................',
    '...................222222.......................',
    '.................2222222222.....................',
    '................222jjjjjj222....................',
    '...............22jjjjjjjjjj22...................',
    '.........2222222jjjjjjjjjjjj2.222222............',
    '.......22222222jjjjjjjjjjjjjj222222222..........',
    '......222jjjjjjjjjjjjjjjjjjjj2jjjjjj222.........',
    '......2jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj2.........',
    '.....2jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj2........',
    '.....2jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj2222.....',
    '.....jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj22222...',
    '.....jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj222..',
    '....2jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj2..',
    '...22jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjk..',
    '...2kkjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjkkk..',
    '....kkkkkjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjkkkkkk...',
    '......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.....',
    '.........kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.........',
    '................................................'
  ], OB_MAP);

  /* cloud: medium */
  var cloudBSprite = makeSprite([
    '..................................',
    '..................................',
    '...............222222.............',
    '..............22222222............',
    '.......22222222jjjjjj22...........',
    '......22222222jjjjjjjj22..........',
    '.....22jjjjjjjjjjjjjjjj222222.....',
    '....22jjjjjjjjjjjjjjjjjj2222222...',
    '....2jjjjjjjjjjjjjjjjjjjjjjjj222..',
    '....jjjjjjjjjjjjjjjjjjjjjjjjjjj2..',
    '...2jjjjjjjjjjjjjjjjjjjjjjjjjjjj..',
    '..22jjjjjjjjjjjjjjjjjjjjjjjjjjjk..',
    '..2kkjjjjjjjjjjjjjjjjjjjjjjjjkkk..',
    '...kkkkkkkkkkkkkkkkkkkkkkkkkkkk...',
    '.....kkkkkkkkkkkkkkkkkkkkkkkk.....',
    '..................................'
  ], OB_MAP);

  /* cloud: small */
  var cloudCSprite = makeSprite([
    '........................',
    '........................',
    '........................',
    '.............222222.....',
    '.....222222.22222222....',
    '....222222222jjjjjj22...',
    '...22jjjjjj2jjjjjjjj2...',
    '...2jjjjjjjjjjjjjjjjj...',
    '..2jjjjjjjjjjjjjjjjjj2..',
    '..2kkkkkkkkkkkkkkkkkk2..',
    '...kkkkkkkkkkkkkkkkkk...',
    '........................'
  ], OB_MAP);

/* >>> SPRITES:END <<< */

  var cassetteSprite = makeSprite([
    '111111111111',
    '1jjjjjjjjjj1',
    '1j1ww11ww1j1',
    '1j1ww11ww1j1',
    '1jjjjjjjjjj1',
    '1wwwwwwwwww1',
    '1wwwwwwwwww1',
    '111111111111'
  ], { '1': C.outline, 'j': C.yellow, 'w': C.pink });

  /* ---------- decks / levels ---------- */
  var THEMES = [
    {
      name: 'NEW WAVE',
      sky: ['#5aa9ff', '#9fd4ff', '#dff1ff'],
      ocean: ['#1b4fd8', '#123a9e'],
      deck: ['#e7c79c', '#cda97a'],
      lip: '#ffffff',
      sun: '#ffd500', sunR: 13,
      stars: false, backdrop: 'ship', haze: 0.9
    },
    {
      name: 'SYNTHWAVE',
      sky: ['#0b0e2a', '#3a1c6e', '#7b2ff7'],
      ocean: ['#0a1a55', '#122f86'],
      deck: ['#232a52', '#171c3a'],
      lip: '#4fe3ff',
      sun: '#ff9a3c', sunR: 15,
      stars: true, backdrop: 'island', haze: 0.35
    },
    {
      name: 'HAIR METAL',
      sky: ['#2a0a12', '#7a1020', '#e63946'],
      ocean: ['#3a0a12', '#7a1020'],
      deck: ['#1a1214', '#120c0e'],
      lip: '#ffd500',
      sun: '#ff4fa0', sunR: 14,
      stars: true, backdrop: 'ship', haze: 0.3
    },
    {
      name: 'FREESTYLE',
      sky: ['#ff9ad5', '#ffd6f0', '#c9f7ff'],
      ocean: ['#12c2a0', '#0f8f78'],
      deck: ['#ffe9c9', '#f0cfa0'],
      lip: '#ffffff',
      sun: '#ffd500', sunR: 13,
      stars: false, backdrop: 'island', haze: 0.85
    },
    {
      name: 'POWER BALLAD',
      sky: ['#1a1f5c', '#ff4fa0', '#ffd500'],
      ocean: ['#12206a', '#7b2ff7'],
      deck: ['#2a1f4a', '#1c1436'],
      lip: '#ffd500',
      sun: '#ff9a3c', sunR: 16,
      stars: true, backdrop: 'island', haze: 0.4
    }
  ];
  var sunSprites = THEMES.map(function (t) { return circleSprite(t.sunR, t.sun); });

  /* ---------- game state ---------- */
  var game = {
    state: 'menu',      // menu | play | dead
    tGlobal: 0,
    t: 0,
    deadTimer: 0,
    distance: 0,
    speed: 140,
    cassettes: 0,
    tapeSpawned: 0,
    deckStartTapes: 0,
    score: 0,
    level: 0,
    prevLevel: 0,
    bannerTimer: 0,
    best: parseInt(localStorage.getItem('deckrunner_best') || '0', 10) || 0,
    mode: localStorage.getItem('deckrunner_mode') === 'hard' ? 'hard' : 'easy',
    obstacles: [],
    items: [],
    spawnTimer: 0
  };

  var STAND_H = 16;
  var DUCK_H = 9;
  var player = {
    x: 44, y: 0, vy: 0, w: 12, h: STAND_H,
    onGround: true, jumps: 0, frame: 0, animT: 0, ducking: false
  };

  /* control state; duck is only active in hard mode */
  var input = { duckKey: false, duckBtn: false };
  var touchSeen = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
  function wantsDuck() { return game.mode === 'hard' && (input.duckKey || input.duckBtn); }

  var GRAVITY = 1500;
  var JUMP_V = -430;
  var MAX_FALL = 720;
  var SPEED_CAP = 330;
  /* mixtapes you must collect on each deck to unlock the next one */
  var DECK_GOALS = [8, 12, 16, 20];

  function reset() {
    game.state = 'play';
    game.t = 0;
    game.deadTimer = 0;
    game.distance = 0;
    game.speed = 140;
    game.cassettes = 0;
    game.tapeSpawned = 0;
    game.deckStartTapes = 0;
    game.score = 0;
    game.level = 0;
    game.prevLevel = 0;
    game.bannerTimer = 1.8;
    game.obstacles.length = 0;
    game.items.length = 0;
    game.spawnTimer = 0.9;
    player.h = STAND_H;
    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.frame = 0;
    player.animT = 0;
    player.ducking = false;
    input.duckKey = false;
    input.duckBtn = false;
  }

  function theme() {
    var i = (game.state === 'play' || game.state === 'dead') ? game.level : 0;
    return THEMES[clamp(i, 0, THEMES.length - 1)];
  }

  /* ---------- audio (tiny WebAudio synth) ---------- */
  var actx = null;
  var muted = false;
  function ensureAudio() {
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) actx = new AC();
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function beep(freq, dur, type, vol) {
    if (!actx || muted) return;
    var o = actx.createOscillator();
    var g = actx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(actx.destination);
    var t = actx.currentTime;
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  }
  function sfxJump() { beep(440, 0.10, 'square', 0.05); }
  function sfxCollect() { beep(880, 0.06, 'square', 0.05); setTimeout(function () { beep(1320, 0.08, 'square', 0.05); }, 55); }
  function sfxDie() { beep(300, 0.18, 'sawtooth', 0.06); setTimeout(function () { beep(180, 0.35, 'sawtooth', 0.06); }, 140); }
  function sfxLevel() { beep(660, 0.08, 'square', 0.05); setTimeout(function () { beep(880, 0.08, 'square', 0.05); }, 80); setTimeout(function () { beep(1100, 0.14, 'square', 0.05); }, 160); }

  /* ---------- input ---------- */
  function jump() {
    if (player.jumps < 2) {
      if (player.ducking) {           /* jumping cancels a duck */
        player.ducking = false;
        player.h = STAND_H;
        player.y = groundY - STAND_H;
      }
      player.vy = JUMP_V;
      player.jumps++;
      player.onGround = false;
      sfxJump();
    }
  }
  function releaseJump() {
    if (player.vy < -120) player.vy = -120;
  }

  function onPress() {
    ensureAudio();
    if (game.state === 'menu') {
      reset();
    } else if (game.state === 'play') {
      jump();
    } else if (game.state === 'dead') {
      if (game.deadTimer > 0.55) reset();
    }
  }

  window.addEventListener('keydown', function (e) {
    /* on the menu, any direction key toggles the mode */
    if (game.state === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
        e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      e.preventDefault();
      setMode(game.mode === 'easy' ? 'hard' : 'easy');
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) onPress();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      input.duckKey = true;
    } else if (e.code === 'KeyM') {
      muted = !muted;
    } else if (e.code === 'Enter') {
      onPress();
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') releaseJump();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') input.duckKey = false;
  });

  /* map a client point into internal canvas coords (handles letterbox) */
  function toInternal(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var scale = Math.min(r.width / VW, r.height / VH);
    var drawnW = VW * scale;
    var drawnH = VH * scale;
    var ox = (r.width - drawnW) / 2;
    var oy = (r.height - drawnH) / 2;
    return {
      x: (clientX - r.left - ox) / scale,
      y: (clientY - r.top - oy) / scale
    };
  }

  var muteBtn = { x: 0, y: 0, w: 20, h: 12 };
  var duckBtn = { x: 6, y: 0, w: 54, h: 20 };
  function layoutHud() { muteBtn.x = VW - muteBtn.w - 4; muteBtn.y = 4; }
  function layoutControls() {
    layoutHud();
    duckBtn.x = 6;
    duckBtn.y = VH - duckBtn.h - 4;
  }
  function hit(r, p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  function modeButtons() {
    var w = Math.min(96, Math.floor((VW - 36) / 2));
    var h = 18, gap = 12;
    var total = w * 2 + gap;
    var x0 = Math.round((VW - total) / 2);
    var y = 118;
    return { easy: { x: x0, y: y, w: w, h: h }, hard: { x: x0 + w + gap, y: y, w: w, h: h } };
  }
  function setMode(m) {
    game.mode = m;
    try { localStorage.setItem('deckrunner_mode', m); } catch (err) {}
  }

  function onPointerDown(e) {
    e.preventDefault();
    ensureAudio();
    if (e.pointerType === 'touch') touchSeen = true;
    var p = toInternal(e.clientX, e.clientY);
    layoutControls();

    if (game.state === 'menu') {
      var mb = modeButtons();
      if (hit(mb.easy, p)) { setMode('easy'); reset(); return; }
      if (hit(mb.hard, p)) { setMode('hard'); reset(); return; }
      onPress();
      return;
    }

    if (hit(muteBtn, p)) { muted = !muted; return; }

    if (game.state === 'play' && game.mode === 'hard' && touchSeen && hit(duckBtn, p)) {
      input.duckBtn = true;
      return;
    }

    onPress();
  }
  function onPointerUp(e) { e.preventDefault(); releaseJump(); input.duckBtn = false; }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- obstacles: sprite metrics + collision boxes ----------
     y = distance from sprite TOP down to the ground line.
     boxes = [ox, oy, w, h] relative to the sprite's top-left. */
  var OB_DEFS = {
    chair: { y: 18, boxes: [[4, 8, 25, 9]] },
    crate: { y: 23, boxes: [[3, 4, 22, 19]] },
    gull:  { y: 14, boxes: [[2, 5, 22, 8]] },          /* low: jump over */
    gullHigh: { y: 25, boxes: [[2, 5, 22, 8]] },       /* high: duck under (hard) */
    stack: { y: 37, boxes: [[3, 4, 22, 33]] }
  };
  function obY(type) { return groundY - OB_DEFS[type].y; }
  function isGull(t) { return t === 'gull' || t === 'gullHigh'; }

  /* ---------- spawning ----------
     Obstacles and mixtapes are placed together as one "feature" so a
     pickup is never trapped inside an obstacle: tapes are either in
     obstacle-free space or lifted above the obstacle's collision top.
     spawnFeature() returns the feature's width so the next one is
     spaced clear of it. */
  var OB_W = { chair: 32, crate: 26, gull: 26, gullHigh: 26, stack: 26 };

  /* how far above the ground line an obstacle's collider reaches */
  function obstacleTop(type) {
    var def = OB_DEFS[type];
    var top = 0;
    for (var b = 0; b < def.boxes.length; b++) {
      var above = def.y - def.boxes[b][1];
      if (above > top) top = above;
    }
    return top;
  }

  function pickObstacleType() {
    var r = Math.random();
    var canTall = game.level >= 1 || game.t > 18;
    if (r < 0.34) return 'chair';
    if (r < 0.60) return 'crate';
    if (r < (canTall ? 0.80 : 0.999)) return 'gull';
    return 'stack';
  }
  /* hard mode swaps birds for high ones you duck under */
  function chooseObstacle() {
    var t = pickObstacleType();
    if (t === 'gull' && game.mode === 'hard') t = 'gullHigh';
    return t;
  }

  /* cy = height of the tape's centre above the ground line */
  function addTape(x, cy) {
    game.items.push({ x: x, y: groundY - cy - 4, w: 12, h: 8, taken: false, bob: Math.random() * 6.28 });
    game.tapeSpawned++;
  }

  function spawnFeature() {
    var baseX = VW + 16;
    var r = Math.random();

    /* 34%: lone obstacle, no tapes */
    if (r < 0.34) {
      var t = chooseObstacle();
      game.obstacles.push({ type: t, x: baseX, flap: 0 });
      return OB_W[t] + 12;
    }

    /* 26%: obstacle with a mixtape arc lifted above it (grab mid-jump) */
    if (r < 0.60) {
      var t2 = chooseObstacle();
      game.obstacles.push({ type: t2, x: baseX, flap: 0 });
      var base = obstacleTop(t2) + 8;
      var peak = Math.min(base + 12, 46);
      for (var i = 0; i < 3; i++) {
        addTape(baseX + 4 + i * 12, base + Math.sin((i / 2) * Math.PI) * (peak - base));
      }
      return OB_W[t2] + 24;
    }

    /* 22%: ground trail in clear space (collect while running) */
    if (r < 0.82) {
      for (var j = 0; j < 4; j++) addTape(baseX + j * 16, 12);
      return 4 * 16 + 14;
    }

    /* 18%: standalone arc in clear space (needs a jump) */
    var n = 5;
    for (var k = 0; k < n; k++) {
      addTape(baseX + k * 16, 20 + Math.sin((k / (n - 1)) * Math.PI) * 24);
    }
    return (n - 1) * 16 + 26;
  }

  /* ---------- update ---------- */
  function update(dt) {
    game.tGlobal += dt;

    if (game.state === 'menu') {
      game.distance += 60 * dt;
      return;
    }

    if (game.state === 'dead') {
      game.deadTimer += dt;
      player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
      player.y += player.vy * dt;
      if (player.y > VH) player.y = VH;
      return;
    }

    /* ---- play ---- */
    game.t += dt;

    /* deck progression: clear this deck's mixtape quota to advance */
    if (game.level < THEMES.length - 1) {
      if (game.cassettes - game.deckStartTapes >= DECK_GOALS[game.level]) {
        game.level++;
        game.deckStartTapes = game.cassettes;
        game.bannerTimer = 2.4;
        sfxLevel();
      }
    }
    if (game.bannerTimer > 0) game.bannerTimer -= dt;

    /* continuous speed ramp (level adds a bump) */
    game.speed = Math.min(SPEED_CAP, 138 + game.t * 3.2 + game.level * 10);
    game.distance += game.speed * dt;

    /* ducking: crouch on the ground to slip under high birds (hard mode) */
    var duckNow = wantsDuck() && player.onGround;
    if (duckNow !== player.ducking) {
      player.ducking = duckNow;
      player.h = duckNow ? DUCK_H : STAND_H;
      if (player.onGround) player.y = groundY - player.h;
    }

    /* player physics */
    player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
    player.y += player.vy * dt;
    if (player.y >= groundY - player.h) {
      player.y = groundY - player.h;
      player.vy = 0;
      player.onGround = true;
      player.jumps = 0;
    }

    /* run-cycle animation (speeds up as the deck speeds up) */
    if (player.onGround) {
      var interval = clamp(0.10 - game.speed * 0.00015, 0.055, 0.10);
      player.animT += dt;
      if (player.animT > interval) {
        player.animT = 0;
        player.frame = (player.frame + 1) % playerFrames.run.length;
      }
    } else {
      player.animT = 0;
    }

    /* spawner: one feature at a time, spaced clear of the last */
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      var fw = spawnFeature();
      var gap = 60 + Math.random() * 70;
      game.spawnTimer = (fw + gap) / game.speed;
    }

    /* scroll world */
    var i, o;
    for (i = game.obstacles.length - 1; i >= 0; i--) {
      o = game.obstacles[i];
      o.x -= game.speed * dt;
      if (isGull(o.type)) o.flap = Math.sin(game.tGlobal * 12) * 2;
      if (o.x < -40) game.obstacles.splice(i, 1);
    }
    for (i = game.items.length - 1; i >= 0; i--) {
      var it = game.items[i];
      it.x -= game.speed * dt;
      it.bob += dt * 6;
      if (it.x + it.w < -8) game.items.splice(i, 1);
    }

    /* collision: player box, slightly forgiving */
    var px = player.x + 3, py = player.y + 2, pw = player.w - 6, ph = player.h - 3;

    for (i = 0; i < game.obstacles.length; i++) {
      o = game.obstacles[i];
      var def = OB_DEFS[o.type];
      var oy = obY(o.type);
      var hit = false;
      for (var b = 0; b < def.boxes.length; b++) {
        var bx = o.x + def.boxes[b][0];
        var by = oy + def.boxes[b][1];
        var bw = def.boxes[b][2];
        var bh = def.boxes[b][3];
        if (px < bx + bw && px + pw > bx && py < by + bh && py + ph > by) { hit = true; break; }
      }
      if (hit) {
        game.state = 'dead';
        game.deadTimer = 0;
        player.vy = -220;
        if (game.score > game.best) {
          game.best = game.score;
          localStorage.setItem('deckrunner_best', String(game.best));
        }
        sfxDie();
        return;
      }
    }

    for (i = 0; i < game.items.length; i++) {
      var c = game.items[i];
      if (c.taken) continue;
      if (px < c.x + c.w && px + pw > c.x && py < c.y + c.h && py + ph > c.y) {
        c.taken = true;
        game.cassettes++;
        sfxCollect();
      }
    }

    game.score = Math.floor(game.distance / 12) + game.cassettes * 50;
  }

  /* ---------- drawing ---------- */
  /* a cruise ship or tropical island drifting past on the horizon */
  function drawBackdrop(th, oceanTop) {
    var spr = th.backdrop === 'island' ? islandSprite : shipSprite;
    var w = spr.width;
    var span = VW + w + 140;
    var drift = game.distance * 0.05;
    var y = oceanTop - spr.height + 8;
    for (var k = 0; k < 2; k++) {
      var x = ((VW + 40 - drift - k * (span / 2)) % span + span) % span - w;
      if (x > -w && x < VW + 4) {
        ctx.drawImage(spr, Math.round(x), Math.round(y));
      }
    }
  }

  function drawBackground() {
    var th = theme();
    var dist = game.distance;
    var oceanTop = groundY - 42;

    /* sky */
    var sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(0.6, th.sky[1]);
    sky.addColorStop(1, th.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, groundY);

    /* stars */
    if (th.stars) {
      for (var s = 0; s < 46; s++) {
        var sx = ((s * 97) - dist * 0.05) % VW;
        if (sx < 0) sx += VW;
        var sy = (s * 53) % (oceanTop - 7);
        var tw = Math.sin(game.tGlobal * 3 + s) > 0;
        ctx.fillStyle = tw ? '#ffffff' : '#9aa8ff';
        ctx.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
      }
    }

    /* sun */
    var sunX = VW * 0.74;
    var sunY = oceanTop - 26;
    var sun = sunSprites[game.state === 'menu' ? 0 : game.level] || sunSprites[0];
    var sr = th.sunR;
    if (th.stars) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(sun, Math.round(sunX - sr), Math.round(sunY - sr));
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(sun, Math.round(sunX - sr), Math.round(sunY - sr));

    /* clouds - original pixel clouds, dimmed by the theme's haze */
    ctx.globalAlpha = th.haze;
    var cloudSet = [cloudASprite, cloudBSprite, cloudCSprite, cloudBSprite];
    for (var k = 0; k < 4; k++) {
      var spr = cloudSet[k];
      var cx = ((k * 90 - dist * 0.15) % (VW + 130));
      if (cx < -130) cx += VW + 130;
      var cy = 12 + (k % 2) * 20;
      ctx.drawImage(spr, Math.round(cx), cy);
    }
    ctx.globalAlpha = 1;

    /* ocean */
    var oc = ctx.createLinearGradient(0, oceanTop, 0, groundY);
    oc.addColorStop(0, th.ocean[0]);
    oc.addColorStop(1, th.ocean[1]);
    ctx.fillStyle = oc;
    ctx.fillRect(0, oceanTop, VW, groundY - oceanTop);

    /* sun reflection */
    ctx.fillStyle = th.stars ? '#ffb45a' : '#ffe98a';
    for (var ry = oceanTop + 3; ry < groundY; ry += 5) {
      var rw = 18 - (ry - oceanTop) * 0.3;
      if (rw > 2) ctx.fillRect(Math.round(sunX - rw / 2), ry, Math.round(rw), 1);
    }

    /* wave lines */
    ctx.fillStyle = th.lip;
    ctx.globalAlpha = 0.5;
    for (var wy = oceanTop + 6; wy < groundY; wy += 7) {
      var off = Math.floor(Math.sin((wy + dist * 0.2) * 0.3) * 3);
      for (var wx = -8; wx < VW + 8; wx += 16) {
        ctx.fillRect(wx + off, wy, 6, 1);
      }
    }
    ctx.globalAlpha = 1;

    /* passing cruise ship / tropical island on the horizon */
    drawBackdrop(th, oceanTop);

    /* deck */
    ctx.fillStyle = th.deck[0];
    ctx.fillRect(0, groundY, VW, VH - groundY);
    ctx.fillStyle = th.deck[1];
    for (var dx = 0; dx < VW; dx += 24) {
      var seam = (dx - Math.floor(dist % 24));
      ctx.fillRect(seam, groundY, 1, VH - groundY);
    }
    ctx.fillStyle = th.lip;
    ctx.fillRect(0, groundY, VW, 2);
  }

  function drawObstacle(o) {
    var x = Math.round(o.x);
    var y = Math.round(obY(o.type));
    if (o.type === 'chair') {
      ctx.drawImage(chairSprite, x, y);
    } else if (o.type === 'crate') {
      ctx.drawImage(crateSprite, x, y);
    } else if (o.type === 'stack') {
      ctx.drawImage(crateSprite, x, y);
      ctx.drawImage(crateSprite, x, y + 14);
    } else if (isGull(o.type)) {
      ctx.drawImage(gullSprite, x, Math.round(y + o.flap));
    }
  }

  function drawPlayer() {
    var x = Math.round(player.x);
    var y = Math.round(player.y);
    /* shadow */
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 1, groundY - 1, player.w - 2, 2);
    ctx.globalAlpha = 1;

    var spr;
    if (player.ducking) {
      spr = playerFrames.duck;
    } else if (player.onGround) {
      spr = playerFrames.run[player.frame % playerFrames.run.length];
    } else {
      spr = player.vy < 0 ? playerFrames.jump : playerFrames.fall;
    }
    ctx.drawImage(spr, x, player.ducking ? y - 1 : y);
  }

  function drawItem(it) {
    var bob = Math.round(Math.sin(it.bob) * 1.5);
    ctx.drawImage(cassetteSprite, Math.round(it.x), Math.round(it.y + bob));
  }

  /* neon rounded-rect badge, echoing the cruise logo */
  function neonBadge(x, y, w, h, fill, border) {
    ctx.fillStyle = border;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = border;
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  }

  function text(str, x, y, color, size, align) {
    ctx.font = size + "px 'Press Start 2P', 'Courier New', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  function tapePct() {
    return game.tapeSpawned ? Math.round(game.cassettes / game.tapeSpawned * 100) : 0;
  }

  function drawHud() {
    layoutHud();
    text('SCORE ' + game.score, 6, 6, C.white, 8);
    text('BEST ' + game.best, VW - 6, 6, C.yellow, 8, 'right');

    var th = theme();
    text('DECK ' + (game.level + 1) + ' - ' + th.name, VW / 2, 6, th.lip, 8, 'center');

    text('TAPES ' + game.cassettes + '  ' + tapePct() + '%', 6, 18, C.cyan, 8);
    if (game.level < THEMES.length - 1) {
      var got = game.cassettes - game.deckStartTapes;
      text('NEXT ' + Math.min(got, DECK_GOALS[game.level]) + '/' + DECK_GOALS[game.level],
        VW / 2, 18, C.white, 6, 'center');
    } else {
      text('FINAL DECK', VW / 2, 18, C.yellow, 6, 'center');
    }
    text(game.mode === 'hard' ? 'HARD' : 'EASY', VW - 6, 18, C.pink, 7, 'right');

    /* mute button */
    ctx.fillStyle = muted ? C.pinkDark : C.navy;
    ctx.fillRect(muteBtn.x, muteBtn.y, muteBtn.w, muteBtn.h);
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1;
    ctx.strokeRect(muteBtn.x + 0.5, muteBtn.y + 0.5, muteBtn.w - 1, muteBtn.h - 1);
    text(muted ? 'MUTE' : 'SND', muteBtn.x + muteBtn.w / 2, muteBtn.y + 3, C.white, 6, 'center');

    /* touch duck button (hard mode, touch devices) */
    if (game.state === 'play' && game.mode === 'hard' && touchSeen) {
      layoutControls();
      ctx.fillStyle = input.duckBtn ? C.pinkDark : C.navy;
      ctx.fillRect(duckBtn.x, duckBtn.y, duckBtn.w, duckBtn.h);
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 1;
      ctx.strokeRect(duckBtn.x + 0.5, duckBtn.y + 0.5, duckBtn.w - 1, duckBtn.h - 1);
      text('DUCK', duckBtn.x + duckBtn.w / 2, duckBtn.y + 6, C.white, 7, 'center');
    }
  }

  function drawBanner() {
    if (game.bannerTimer <= 0) return;
    var th = theme();
    var a = clamp(game.bannerTimer / 0.5, 0, 1);
    ctx.globalAlpha = a;
    var w = Math.min(VW - 30, 240);
    var x = Math.round((VW - w) / 2);
    var y = 44;
    ctx.fillStyle = th.lip;
    ctx.fillRect(x, y, w, 24);
    ctx.fillStyle = C.navyDeep;
    ctx.fillRect(x + 2, y + 2, w - 4, 20);
    text('NOW PLAYING', VW / 2, y + 5, C.cyan, 7, 'center');
    text('DECK ' + (game.level + 1) + ' - ' + th.name, VW / 2, y + 13, C.yellow, 8, 'center');
    ctx.globalAlpha = 1;
  }

  function drawModeBtn(b, label, selected) {
    ctx.fillStyle = selected ? C.yellow : C.navy;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = selected ? C.pink : C.cyan;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    text(label, b.x + b.w / 2, b.y + 6, selected ? C.navyDeep : C.white, 8, 'center');
  }

  function drawMenu() {
    drawBackground();
    var cx = VW / 2;
    var badgeW = Math.min(VW - 24, 250);
    var badgeH = 92;
    var bx = Math.round(cx - badgeW / 2);
    var by = 14;
    neonBadge(bx, by, badgeW, badgeH, C.navy, C.pink);

    var ts = clamp(Math.floor(VW / 22), 10, 16);
    text('THE 80s', cx, by + 10, C.yellow, ts, 'center');
    text('CRUISE', cx, by + 10 + ts + 4, C.yellow, ts, 'center');
    var ss = clamp(Math.floor(VW / 38), 7, 10);
    text('DECK RUNNER', cx, by + 10 + ts * 2 + 12, C.cyan, ss, 'center');
    text('YEAR 11', cx, by + badgeH - 13, C.pink, 7, 'center');

    /* mode select */
    var mb = modeButtons();
    text('CHOOSE MODE', cx, mb.y - 10, C.white, 6, 'center');
    drawModeBtn(mb.easy, 'EASY', game.mode === 'easy');
    drawModeBtn(mb.hard, 'HARD', game.mode === 'hard');

    text(game.mode === 'hard' ? 'JUMP: SPACE / UP    DUCK: DOWN / S'
      : 'JUMP ONLY', cx, mb.y + mb.h + 8, C.cyan, 5, 'center');

    var blink = Math.sin(game.tGlobal * 4) > -0.2;
    if (blink) text('TAP A MODE OR PRESS SPACE TO START', cx, mb.y + mb.h + 20, C.white, 6, 'center');
    text('COLLECT MIXTAPES TO UNLOCK THE NEXT DECK', cx, VH - 12, C.white, 5, 'center');
  }

  function drawDead() {
    ctx.fillStyle = 'rgba(11,13,26,0.55)';
    ctx.fillRect(0, 0, VW, VH);
    var cx = VW / 2;
    var ts = clamp(Math.floor(VW / 26), 10, 16);
    text('GAME OVER', cx, VH / 2 - 48, C.pink, ts, 'center');
    text('SCORE ' + game.score, cx, VH / 2 - 22, C.white, 10, 'center');
    text('BEST ' + game.best, cx, VH / 2 - 6, C.yellow, 10, 'center');
    text('TAPES ' + game.cassettes + '/' + game.tapeSpawned + '  ' + tapePct() + '%',
      cx, VH / 2 + 12, C.cyan, 8, 'center');
    text('REACHED DECK ' + (game.level + 1) + ' - ' + theme().name,
      cx, VH / 2 + 28, C.white, 6, 'center');
    if (game.deadTimer > 0.55 && Math.sin(game.tGlobal * 4) > -0.2) {
      text('TAP TO RETRY', cx, VH / 2 + 46, C.white, 8, 'center');
    }
  }

  function drawScanlines() {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (var y = 0; y < VH; y += 2) ctx.fillRect(0, y, VW, 1);
  }

  function render() {
    if (game.state === 'menu') {
      drawMenu();
    } else {
      drawBackground();
      var i;
      for (i = 0; i < game.items.length; i++) {
        if (!game.items[i].taken) drawItem(game.items[i]);
      }
      for (i = 0; i < game.obstacles.length; i++) drawObstacle(game.obstacles[i]);
      drawPlayer();
      drawHud();
      drawBanner();
      if (game.state === 'dead') drawDead();
    }
    drawScanlines();
  }

  /* ---------- loop ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; /* clamp for tab switches */
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
