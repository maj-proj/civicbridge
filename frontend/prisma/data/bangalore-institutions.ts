/**
 * Bengaluru sensitive-zone source list: names only.
 *
 * Coordinates are deliberately absent. They are resolved from OpenStreetMap
 * by scripts/geocode-zones.ts and written to bangalore-zones.json, which is
 * what the seed actually loads. Hand-written coordinates for a list this size
 * would be guesswork, and these feed real proximity scoring.
 *
 * `query` is what gets geocoded — a precise, unambiguous search string.
 * `name` is what appears in the UI and in the notice sent to an authority.
 */

export type ZoneKind = "HOSPITAL" | "SCHOOL" | "COLLEGE";

export interface InstitutionSeed {
  name: string;
  query: string;
  type: ZoneKind;
}

/** Radius and weight are per-kind, not per-institution. */
export const ZONE_DEFAULTS: Record<
  ZoneKind,
  { radiusMeters: number; weight: number }
> = {
  // Patients, open wards and biomedical risk: the strongest escalation.
  HOSPITAL: { radiusMeters: 400, weight: 1.6 },
  // Children, and small sites, so a tighter radius.
  SCHOOL: { radiusMeters: 350, weight: 1.5 },
  // Large campuses with dense footfall, slightly below a school.
  COLLEGE: { radiusMeters: 500, weight: 1.45 },
};

export const INSTITUTIONS: InstitutionSeed[] = [
  // --- Engineering colleges (COMEDK / VTU) -------------------------------
  {
    name: "JSS Academy of Technical Education, Bengaluru",
    query: "JSS Academy of Technical Education, Uttarahalli, Bengaluru",
    type: "COLLEGE",
  },
  { name: "R V College of Engineering", query: "R V College of Engineering, Mysore Road, Bengaluru", type: "COLLEGE" },
  { name: "BMS College of Engineering", query: "BMS College of Engineering, Basavanagudi, Bengaluru", type: "COLLEGE" },
  { name: "PES University, Banashankari", query: "PES University, Banashankari, Bengaluru", type: "COLLEGE" },
  { name: "M S Ramaiah Institute of Technology", query: "M S Ramaiah Institute of Technology, Mathikere, Bengaluru", type: "COLLEGE" },
  { name: "Dayananda Sagar College of Engineering", query: "Dayananda Sagar College of Engineering, Shavige Malleshwara Hills, Bengaluru", type: "COLLEGE" },
  { name: "BNM Institute of Technology", query: "BNM Institute of Technology, Banashankari, Bengaluru", type: "COLLEGE" },
  { name: "Sir M Visvesvaraya Institute of Technology", query: "Sir M Visvesvaraya Institute of Technology, Hunasamaranahalli, Bengaluru", type: "COLLEGE" },
  { name: "New Horizon College of Engineering", query: "New Horizon College of Engineering, Marathahalli, Bengaluru", type: "COLLEGE" },
  { name: "Nitte Meenakshi Institute of Technology", query: "Nitte Meenakshi Institute of Technology, Yelahanka, Bengaluru", type: "COLLEGE" },
  { name: "CMR Institute of Technology", query: "CMR Institute of Technology, AECS Layout, Bengaluru", type: "COLLEGE" },
  { name: "Bangalore Institute of Technology", query: "Bangalore Institute of Technology, K R Road, Bengaluru", type: "COLLEGE" },
  { name: "Acharya Institute of Technology", query: "Acharya Institute of Technology, Soladevanahalli, Bengaluru", type: "COLLEGE" },
  { name: "Dr. Ambedkar Institute of Technology", query: "Dr Ambedkar Institute of Technology, Mallathahalli, Bengaluru", type: "COLLEGE" },
  { name: "Global Academy of Technology", query: "Global Academy of Technology, Rajarajeshwari Nagar, Bengaluru", type: "COLLEGE" },
  { name: "Sapthagiri College of Engineering", query: "Sapthagiri College of Engineering, Chikkasandra, Bengaluru", type: "COLLEGE" },
  { name: "RNS Institute of Technology", query: "RNS Institute of Technology, Channasandra, Bengaluru", type: "COLLEGE" },
  { name: "Atria Institute of Technology", query: "Atria Institute of Technology, Anandnagar, Bengaluru", type: "COLLEGE" },
  { name: "East Point College of Engineering and Technology", query: "East Point College of Engineering, Virgo Nagar, Bengaluru", type: "COLLEGE" },
  { name: "MVJ College of Engineering", query: "MVJ College of Engineering, Whitefield, Bengaluru", type: "COLLEGE" },
  { name: "The Oxford College of Engineering", query: "The Oxford College of Engineering, Bommanahalli, Bengaluru", type: "COLLEGE" },
  { name: "BMS Institute of Technology and Management", query: "BMS Institute of Technology and Management, Yelahanka, Bengaluru", type: "COLLEGE" },
  { name: "Vemana Institute of Technology", query: "Vemana Institute of Technology, Koramangala, Bengaluru", type: "COLLEGE" },
  { name: "K S Institute of Technology", query: "K S Institute of Technology, Raghuvanahalli, Bengaluru", type: "COLLEGE" },
  { name: "Don Bosco Institute of Technology", query: "Don Bosco Institute of Technology, Kumbalgodu, Bengaluru", type: "COLLEGE" },
  { name: "Cambridge Institute of Technology", query: "Cambridge Institute of Technology, KR Puram, Bengaluru", type: "COLLEGE" },
  { name: "HKBK College of Engineering", query: "HKBK College of Engineering, Nagawara, Bengaluru", type: "COLLEGE" },
  { name: "SJB Institute of Technology", query: "SJB Institute of Technology, Kengeri, Bengaluru", type: "COLLEGE" },
  { name: "T John Institute of Technology", query: "T John College, Gottigere, Bengaluru", type: "COLLEGE" },
  { name: "Rajarajeswari College of Engineering", query: "RajaRajeswari College of Engineering, Mysore Road, Bengaluru", type: "COLLEGE" },
  { name: "AMC Engineering College", query: "AMC Engineering College, Bannerghatta Road, Bengaluru", type: "COLLEGE" },
  { name: "Sambhram Institute of Technology", query: "Sambhram Institute of Technology, M S Palya, Bengaluru", type: "COLLEGE" },
  { name: "Nagarjuna College of Engineering and Technology", query: "Nagarjuna College of Engineering, Venkatagirikote, Bengaluru", type: "COLLEGE" },
  { name: "Brindavan College of Engineering", query: "Brindavan College, Dwarakanagar, Yelahanka, Bengaluru", type: "COLLEGE" },
  { name: "Impact College of Engineering and Applied Sciences", query: "Impact College of Engineering, Sahakar Nagar, Bengaluru", type: "COLLEGE" },
  { name: "City Engineering College", query: "City Engineering College, Doddakallasandra, Bengaluru", type: "COLLEGE" },

  // --- Universities and degree colleges ----------------------------------
  { name: "Indian Institute of Science", query: "Indian Institute of Science, Bengaluru", type: "COLLEGE" },
  { name: "Indian Institute of Management Bangalore", query: "Indian Institute of Management Bangalore, Bannerghatta Road", type: "COLLEGE" },
  { name: "National Law School of India University", query: "National Law School of India University, Nagarbhavi, Bengaluru", type: "COLLEGE" },
  { name: "Bangalore University, Jnana Bharathi", query: "Bangalore University Jnana Bharathi Campus, Bengaluru", type: "COLLEGE" },
  { name: "Christ University, Hosur Road", query: "Christ University, Hosur Road, Bengaluru", type: "COLLEGE" },
  { name: "Jain University, Jayanagar", query: "Jain University, Jayanagar, Bengaluru", type: "COLLEGE" },
  { name: "REVA University", query: "REVA University, Yelahanka, Bengaluru", type: "COLLEGE" },
  { name: "Presidency University, Bengaluru", query: "Presidency University, Itgalpura, Bengaluru", type: "COLLEGE" },
  { name: "Alliance University", query: "Alliance University, Anekal, Bengaluru", type: "COLLEGE" },
  { name: "St. Joseph's University", query: "St Joseph's University, Langford Road, Bengaluru", type: "COLLEGE" },
  { name: "Mount Carmel College", query: "Mount Carmel College, Vasanth Nagar, Bengaluru", type: "COLLEGE" },
  { name: "Jyoti Nivas College", query: "Jyoti Nivas College, Koramangala, Bengaluru", type: "COLLEGE" },
  { name: "Kristu Jayanti College", query: "Kristu Jayanti College, Kothanur, Bengaluru", type: "COLLEGE" },
  { name: "Surana College", query: "Surana College, South End Road, Bengaluru", type: "COLLEGE" },
  { name: "NMKRV College for Women", query: "NMKRV College, Jayanagar 3rd Block, Bengaluru", type: "COLLEGE" },

  // --- Hospitals ----------------------------------------------------------
  { name: "Victoria Hospital", query: "Victoria Hospital, Kalasipalya, Bengaluru", type: "HOSPITAL" },
  { name: "Bowring and Lady Curzon Hospital", query: "Bowring and Lady Curzon Hospital, Shivajinagar, Bengaluru", type: "HOSPITAL" },
  { name: "Vani Vilas Hospital", query: "Vani Vilas Women and Children Hospital, Bengaluru", type: "HOSPITAL" },
  { name: "St. John's Medical College Hospital", query: "St John's Medical College Hospital, Koramangala, Bengaluru", type: "HOSPITAL" },
  { name: "NIMHANS", query: "NIMHANS, Hosur Road, Bengaluru", type: "HOSPITAL" },
  { name: "Kidwai Memorial Institute of Oncology", query: "Kidwai Memorial Institute of Oncology, Bengaluru", type: "HOSPITAL" },
  { name: "Sri Jayadeva Institute of Cardiovascular Sciences", query: "Jayadeva Hospital, Bannerghatta Road, Bengaluru", type: "HOSPITAL" },
  { name: "Indira Gandhi Institute of Child Health", query: "Indira Gandhi Institute of Child Health, Bengaluru", type: "HOSPITAL" },
  { name: "Manipal Hospital, Old Airport Road", query: "Manipal Hospital, Old Airport Road, Bengaluru", type: "HOSPITAL" },
  { name: "Manipal Hospital, Whitefield", query: "Manipal Hospital, Whitefield, Bengaluru", type: "HOSPITAL" },
  { name: "Fortis Hospital, Bannerghatta Road", query: "Fortis Hospital, Bannerghatta Road, Bengaluru", type: "HOSPITAL" },
  { name: "Fortis Hospital, Cunningham Road", query: "Fortis Hospital, Cunningham Road, Bengaluru", type: "HOSPITAL" },
  { name: "Apollo Hospital, Bannerghatta Road", query: "Apollo Hospital, Bannerghatta Road, Bengaluru", type: "HOSPITAL" },
  { name: "Narayana Institute of Cardiac Sciences", query: "Narayana Hrudayalaya, Bommasandra, Bengaluru", type: "HOSPITAL" },
  { name: "Sakra World Hospital", query: "Sakra World Hospital, Marathahalli, Bengaluru", type: "HOSPITAL" },
  { name: "Aster CMI Hospital", query: "Aster CMI Hospital, Hebbal, Bengaluru", type: "HOSPITAL" },
  { name: "M S Ramaiah Memorial Hospital", query: "Ramaiah Memorial Hospital, MSRIT Post, Bengaluru", type: "HOSPITAL" },
  { name: "Sparsh Hospital, Infantry Road", query: "Sparsh Hospital, Infantry Road, Bengaluru", type: "HOSPITAL" },
  { name: "BGS Gleneagles Global Hospital", query: "BGS Global Hospital, Uttarahalli Main Road, Bengaluru", type: "HOSPITAL" },
  { name: "Vydehi Institute of Medical Sciences", query: "Vydehi Institute of Medical Sciences, Whitefield, Bengaluru", type: "HOSPITAL" },
  { name: "Bangalore Baptist Hospital", query: "Bangalore Baptist Hospital, Hebbal, Bengaluru", type: "HOSPITAL" },
  { name: "St. Martha's Hospital", query: "St Martha's Hospital, Nrupathunga Road, Bengaluru", type: "HOSPITAL" },
  { name: "Mallya Hospital", query: "Mallya Hospital, Vittal Mallya Road, Bengaluru", type: "HOSPITAL" },
  { name: "HOSMAT Hospital", query: "HOSMAT Hospital, Magrath Road, Bengaluru", type: "HOSPITAL" },
  { name: "K C General Hospital", query: "K C General Hospital, Malleshwaram, Bengaluru", type: "HOSPITAL" },
  { name: "Rajiv Gandhi Institute of Chest Diseases", query: "Rajiv Gandhi Institute of Chest Diseases, Hosur Road, Bengaluru", type: "HOSPITAL" },
  // Formerly Columbia Asia Hebbal; OSM carries the current name.
  { name: "Manipal Hospital, Hebbal", query: "Manipal Hospital, Bellary Road, Byatarayanapura, Bengaluru", type: "HOSPITAL" },
  { name: "Chinmaya Mission Hospital", query: "Chinmaya Mission Hospital, Indiranagar, Bengaluru", type: "HOSPITAL" },
  { name: "Cloudnine Hospital, Jayanagar", query: "Cloudnine Hospital, Jayanagar, Bengaluru", type: "HOSPITAL" },
  { name: "Rangadore Memorial Hospital", query: "Rangadore Memorial Hospital, Basavanagudi, Bengaluru", type: "HOSPITAL" },

  // --- Schools ------------------------------------------------------------
  { name: "Bishop Cotton Boys' School", query: "Bishop Cotton Boys School, Residency Road, Bengaluru", type: "SCHOOL" },
  { name: "Bishop Cotton Girls' School", query: "Bishop Cotton Girls School, St Marks Road, Bengaluru", type: "SCHOOL" },
  { name: "Baldwin Boys High School", query: "Baldwin Boys High School, Richmond Town, Bengaluru", type: "SCHOOL" },
  { name: "Baldwin Girls High School", query: "Baldwin Girls High School, Richmond Town, Bengaluru", type: "SCHOOL" },
  { name: "St. Joseph's Boys' High School", query: "St Joseph's Boys High School, Museum Road, Bengaluru", type: "SCHOOL" },
  { name: "Clarence High School", query: "Clarence High School, Richmond Town, Bengaluru", type: "SCHOOL" },
  { name: "Frank Anthony Public School", query: "Frank Anthony Public School, Cavalry Road, Bengaluru", type: "SCHOOL" },
  { name: "Sophia High School", query: "Sophia High School, Palace Road, Bengaluru", type: "SCHOOL" },
  { name: "National Public School, Indiranagar", query: "National Public School, Indiranagar, Bengaluru", type: "SCHOOL" },
  { name: "National Public School, Koramangala", query: "National Public School Koramangala 3rd Block, Bengaluru", type: "SCHOOL" },
  { name: "National Public School, Rajajinagar", query: "National Public School, Rajajinagar, Bengaluru", type: "SCHOOL" },
  { name: "National Public School, HSR Layout", query: "National Public School, HSR Layout, Bengaluru", type: "SCHOOL" },
  { name: "Delhi Public School, Bangalore North", query: "Delhi Public School Bangalore North, Sonnappanahalli, Bengaluru", type: "SCHOOL" },
  { name: "Delhi Public School, Bangalore East", query: "Delhi Public School Bangalore East, Whitefield, Bengaluru", type: "SCHOOL" },
  { name: "Delhi Public School, Bangalore South", query: "Delhi Public School Bangalore South, Konanakunte, Bengaluru", type: "SCHOOL" },
  { name: "The International School Bangalore", query: "The International School Bangalore, Whitefield, Bengaluru", type: "SCHOOL" },
  { name: "Greenwood High International School", query: "Greenwood High School, Chikkawadayarapura, Sarjapur Road, Bengaluru", type: "SCHOOL" },
  { name: "Inventure Academy", query: "Inventure Academy, Whitefield Sarjapur Road, Bengaluru", type: "SCHOOL" },
  { name: "Mallya Aditi International School", query: "Mallya Aditi International School, Yelahanka, Bengaluru", type: "SCHOOL" },
  { name: "Stonehill International School", query: "Stonehill International School, Tarahunise, Bengaluru", type: "SCHOOL" },
  { name: "Vidyashilp Academy", query: "Vidyashilp Academy, Jakkur, Bengaluru", type: "SCHOOL" },
  { name: "Sri Kumaran Children's Home", query: "Sri Kumaran Children's Home, Mallasandra, Bengaluru", type: "SCHOOL" },
  { name: "Bethany High School", query: "Bethany High School, Koramangala, Bengaluru", type: "SCHOOL" },
  { name: "New Horizon Public School", query: "New Horizon Public School, Indiranagar, Bengaluru", type: "SCHOOL" },
  { name: "Gear Innovative International School", query: "Gear Innovative International School, Doddakannelli, Bengaluru", type: "SCHOOL" },
  { name: "Vibgyor High, Marathahalli", query: "Vibgyor High School, Marathahalli, Bengaluru", type: "SCHOOL" },
  { name: "Ryan International School, Bengaluru", query: "Ryan International School, Kundalahalli, Bengaluru", type: "SCHOOL" },
  { name: "Oakridge International School", query: "Oakridge International School, Varthur, Bengaluru", type: "SCHOOL" },
  { name: "Poorna Prajna Education Centre", query: "Poorna Prajna Education Centre, Girinagar, Bengaluru", type: "SCHOOL" },
  { name: "Carmel School, Padmanabhanagar", query: "Carmel School, Padmanabhanagar, Bengaluru", type: "SCHOOL" },
];
