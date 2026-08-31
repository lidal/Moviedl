/**
 * The curated slate.
 *
 * A good TYPECAST film is one where the cast's reputation and the film's
 * actual rating disagree — a stacked ensemble in a disaster, or a modest
 * cast in something great. Films where the two agree are boring: the line
 * lands on the answer and there is no bet to make.
 *
 * The five names are the top-billed cast — just the actor, not the character.
 * A character name is often a bigger giveaway than the actor's own filmography
 * (there is no version of naming "Tony Stark" that isn't naming the film), so
 * cast entries carry nothing but `name`. Reveal order is derived, not authored:
 * the engine sorts by career volatility descending, so the wildcard opens and
 * the most typecast actor closes.
 *
 * `rating` is the audience rating from RATING_SOURCE. See docs/DATA.md.
 *
 * `year`, `runtime`, `certificate` and `genres` form the dossier shown before
 * the first bet, so the opening round is an informed gamble rather than a blind
 * one. They deliberately describe the *register* of the film without naming it.
 *
 * `tagline` is supported by the UI but left empty on purpose — a recognisable
 * tagline gives the film away outright and there is no game left after that.
 * `npm run build:data` can fill them in from TMDb if you want to curate them.
 */

/**
 * Which service the ratings come from. Shown in the UI so the player knows
 * what number they are betting on; `npm run build:data` rewrites it to match
 * whatever it pulled from.
 */
export const RATING_SOURCE = 'IMDb';

/**
 * 'estimated' | 'verified'. Whether `rating` and every actor's `avg`/`sd` are
 * hand-curated approximations or numbers actually pulled from RATING_SOURCE.
 *
 * The UI shows this: an estimated build says so next to every number it
 * displays, rather than presenting a guess as a fact attributed to a named,
 * checkable source. `scripts/build-puzzles.mjs` flips this to 'verified' when
 * it regenerates the file from real data — see docs/DATA.md.
 */
export const DATA_STATUS = 'estimated';
export const PUZZLES = [
  {
    id: '8mm-1999',
    title: '8MM',
    year: 1999,
    runtime: 123,
    certificate: 'R',
    genres: ['Crime', 'Drama', 'Mystery'],
    director: 'Joel Schumacher',
    rating: 6.5,
    cast: [
      { name: 'Nicolas Cage' },
      { name: 'Joaquin Phoenix' },
      { name: 'James Gandolfini' },
      { name: 'Peter Stormare' },
      { name: 'Anthony Heald' },
    ],
    note: 'The film that started this whole idea.',
  },
  {
    id: 'face-off-1997',
    title: 'Face/Off',
    year: 1997,
    runtime: 138,
    certificate: 'R',
    genres: ['Action', 'Crime', 'Thriller'],
    director: 'John Woo',
    rating: 7.3,
    cast: [
      { name: 'John Travolta' },
      { name: 'Nicolas Cage' },
      { name: 'Joan Allen' },
      { name: 'Alessandro Nivola' },
      { name: 'Gina Gershon' },
    ],
    note: 'Two of the most volatile careers in Hollywood, in one film.',
  },
  {
    id: 'wicker-man-2006',
    title: 'The Wicker Man',
    year: 2006,
    runtime: 102,
    certificate: 'PG-13',
    genres: ['Horror', 'Mystery', 'Thriller'],
    director: 'Neil LaBute',
    rating: 3.7,
    cast: [
      { name: 'Nicolas Cage' },
      { name: 'Ellen Burstyn' },
      { name: 'Kate Beahan' },
      { name: 'Frances Conroy' },
      { name: 'Molly Parker' },
    ],
    note: 'Not the bees.',
  },
  {
    id: 'adaptation-2002',
    title: 'Adaptation.',
    year: 2002,
    runtime: 115,
    certificate: 'R',
    genres: ['Comedy', 'Drama'],
    director: 'Spike Jonze',
    rating: 7.7,
    cast: [
      { name: 'Nicolas Cage' },
      { name: 'Meryl Streep' },
      { name: 'Chris Cooper' },
      { name: 'Tilda Swinton' },
      { name: 'Brian Cox' },
    ],
    note: 'Same wildcard, opposite end of the range.',
  },
  {
    id: 'heat-1995',
    title: 'Heat',
    year: 1995,
    runtime: 170,
    certificate: 'R',
    genres: ['Action', 'Crime', 'Drama'],
    director: 'Michael Mann',
    rating: 8.3,
    cast: [
      { name: 'Al Pacino' },
      { name: 'Robert De Niro' },
      { name: 'Val Kilmer' },
      { name: 'Jon Voight' },
      { name: 'Tom Sizemore' },
    ],
  },
  {
    id: 'righteous-kill-2008',
    title: 'Righteous Kill',
    year: 2008,
    runtime: 101,
    certificate: 'R',
    genres: ['Action', 'Crime', 'Thriller'],
    director: 'Jon Avnet',
    rating: 6.0,
    cast: [
      { name: 'Robert De Niro' },
      { name: 'Al Pacino' },
      { name: 'Carla Gugino' },
      { name: 'John Leguizamo' },
      { name: 'Donnie Wahlberg' },
    ],
    note: 'The same two leads. Thirteen years later.',
  },
  {
    id: 'jack-and-jill-2011',
    title: 'Jack and Jill',
    year: 2011,
    runtime: 91,
    certificate: 'PG',
    genres: ['Comedy', 'Family'],
    director: 'Dennis Dugan',
    rating: 3.4,
    cast: [
      { name: 'Adam Sandler' },
      { name: 'Katie Holmes' },
      { name: 'Al Pacino' },
      { name: 'Eugenio Derbez' },
      { name: 'David Spade' },
    ],
    note: 'An Academy Award winner is in this one.',
  },
  {
    id: 'gigli-2003',
    title: 'Gigli',
    year: 2003,
    runtime: 121,
    certificate: 'R',
    genres: ['Comedy', 'Crime', 'Romance'],
    director: 'Martin Brest',
    rating: 2.6,
    cast: [
      { name: 'Ben Affleck' },
      { name: 'Jennifer Lopez' },
      { name: 'Justin Bartha' },
      { name: 'Al Pacino' },
      { name: 'Christopher Walken' },
    ],
  },
  {
    id: 'the-prestige-2006',
    title: 'The Prestige',
    year: 2006,
    runtime: 130,
    certificate: 'PG-13',
    genres: ['Drama', 'Mystery', 'Sci-Fi'],
    director: 'Christopher Nolan',
    rating: 8.5,
    cast: [
      { name: 'Christian Bale' },
      { name: 'Hugh Jackman' },
      { name: 'Scarlett Johansson' },
      { name: 'Michael Caine' },
      { name: 'Piper Perabo' },
    ],
  },
  {
    id: 'batman-and-robin-1997',
    title: 'Batman & Robin',
    year: 1997,
    runtime: 125,
    certificate: 'PG-13',
    genres: ['Action', 'Adventure', 'Sci-Fi'],
    director: 'Joel Schumacher',
    rating: 3.8,
    cast: [
      { name: 'Arnold Schwarzenegger' },
      { name: 'George Clooney' },
      { name: "Chris O'Donnell" },
      { name: 'Uma Thurman' },
      { name: 'Alicia Silverstone' },
    ],
  },
  {
    id: 'michael-clayton-2007',
    title: 'Michael Clayton',
    year: 2007,
    runtime: 119,
    certificate: 'R',
    genres: ['Crime', 'Drama', 'Thriller'],
    director: 'Tony Gilroy',
    rating: 7.2,
    cast: [
      { name: 'George Clooney' },
      { name: 'Tom Wilkinson' },
      { name: 'Tilda Swinton' },
      { name: 'Sydney Pollack' },
      { name: "Michael O'Keefe" },
    ],
  },
  {
    id: 'the-departed-2006',
    title: 'The Departed',
    year: 2006,
    runtime: 151,
    certificate: 'R',
    genres: ['Crime', 'Drama', 'Thriller'],
    director: 'Martin Scorsese',
    rating: 8.5,
    cast: [
      { name: 'Leonardo DiCaprio' },
      { name: 'Matt Damon' },
      { name: 'Jack Nicholson' },
      { name: 'Mark Wahlberg' },
      { name: 'Martin Sheen' },
    ],
  },
  {
    id: 'the-happening-2008',
    title: 'The Happening',
    year: 2008,
    runtime: 91,
    certificate: 'R',
    genres: ['Sci-Fi', 'Thriller'],
    director: 'M. Night Shyamalan',
    rating: 5.0,
    cast: [
      { name: 'Mark Wahlberg' },
      { name: 'Zooey Deschanel' },
      { name: 'John Leguizamo' },
      { name: 'Ashlyn Sanchez' },
      { name: 'Betty Buckley' },
    ],
  },
  {
    id: 'the-counselor-2013',
    title: 'The Counselor',
    year: 2013,
    runtime: 117,
    certificate: 'R',
    genres: ['Crime', 'Drama', 'Thriller'],
    director: 'Ridley Scott',
    rating: 5.3,
    cast: [
      { name: 'Michael Fassbender' },
      { name: 'Penélope Cruz' },
      { name: 'Cameron Diaz' },
      { name: 'Javier Bardem' },
      { name: 'Brad Pitt' },
    ],
    note: 'Cormac McCarthy wrote it. That is not a guarantee.',
  },
  {
    id: 'true-romance-1993',
    title: 'True Romance',
    year: 1993,
    runtime: 119,
    certificate: 'R',
    genres: ['Crime', 'Drama', 'Romance'],
    director: 'Tony Scott',
    rating: 7.9,
    cast: [
      { name: 'Christian Slater' },
      { name: 'Patricia Arquette' },
      { name: 'Dennis Hopper' },
      { name: 'Val Kilmer' },
      { name: 'Gary Oldman' },
    ],
  },
  {
    id: 'the-fifth-element-1997',
    title: 'The Fifth Element',
    year: 1997,
    runtime: 126,
    certificate: 'PG-13',
    genres: ['Action', 'Adventure', 'Sci-Fi'],
    director: 'Luc Besson',
    rating: 7.6,
    cast: [
      { name: 'Bruce Willis' },
      { name: 'Milla Jovovich' },
      { name: 'Gary Oldman' },
      { name: 'Ian Holm' },
      { name: 'Chris Tucker' },
    ],
  },
  {
    id: 'cats-2019',
    title: 'Cats',
    year: 2019,
    runtime: 110,
    certificate: 'PG',
    genres: ['Comedy', 'Fantasy', 'Musical'],
    director: 'Tom Hooper',
    rating: 2.8,
    cast: [
      { name: 'Judi Dench' },
      { name: 'Idris Elba' },
      { name: 'Jennifer Hudson' },
      { name: 'Taylor Swift' },
      { name: 'Rebel Wilson' },
    ],
    note: 'Directed by the man who had just won Best Picture.',
  },
  {
    id: 'speed-2-1997',
    title: 'Speed 2: Cruise Control',
    year: 1997,
    runtime: 121,
    certificate: 'PG-13',
    genres: ['Action', 'Adventure', 'Thriller'],
    director: 'Jan de Bont',
    rating: 3.9,
    cast: [
      { name: 'Sandra Bullock' },
      { name: 'Jason Patric' },
      { name: 'Willem Dafoe' },
      { name: 'Temuera Morrison' },
      { name: 'Brian McCardie' },
    ],
  },
  {
    id: 'boogie-nights-1997',
    title: 'Boogie Nights',
    year: 1997,
    runtime: 155,
    certificate: 'R',
    genres: ['Drama'],
    director: 'Paul Thomas Anderson',
    rating: 7.9,
    cast: [
      { name: 'Mark Wahlberg' },
      { name: 'Julianne Moore' },
      { name: 'Burt Reynolds' },
      { name: 'Don Cheadle' },
      { name: 'John C. Reilly' },
    ],
  },
  {
    id: 'con-air-1997',
    title: 'Con Air',
    year: 1997,
    runtime: 115,
    certificate: 'R',
    genres: ['Action', 'Crime', 'Thriller'],
    director: 'Simon West',
    rating: 6.9,
    cast: [
      { name: 'Nicolas Cage' },
      { name: 'John Cusack' },
      { name: 'John Malkovich' },
      { name: 'Steve Buscemi' },
      { name: 'Ving Rhames' },
    ],
  },
  {
    id: 'collateral-2004',
    title: 'Collateral',
    year: 2004,
    runtime: 120,
    certificate: 'R',
    genres: ['Crime', 'Drama', 'Thriller'],
    director: 'Michael Mann',
    rating: 7.5,
    cast: [
      { name: 'Tom Cruise' },
      { name: 'Jamie Foxx' },
      { name: 'Jada Pinkett Smith' },
      { name: 'Mark Ruffalo' },
      { name: 'Bruce McGill' },
    ],
  },
  {
    id: 'mamma-mia-2008',
    title: 'Mamma Mia!',
    year: 2008,
    runtime: 108,
    certificate: 'PG-13',
    genres: ['Comedy', 'Musical', 'Romance'],
    director: 'Phyllida Lloyd',
    rating: 6.4,
    cast: [
      { name: 'Meryl Streep' },
      { name: 'Pierce Brosnan' },
      { name: 'Amanda Seyfried' },
      { name: 'Colin Firth' },
      { name: 'Stellan Skarsgård' },
    ],
  },
];
