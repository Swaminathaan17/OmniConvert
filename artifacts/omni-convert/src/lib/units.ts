import unitConvert, { type Unit as LibraryUnit } from "convert";

export type Unit = {
  name: string;
  symbol: string;
  factor: number;
  categoryId: string;
  libraryUnit?: LibraryUnit;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  units: Unit[];
  temperature?: boolean;
  assumption?: string;
};

type UnitDefinition = Omit<Unit, "categoryId">;

const u = (name: string, symbol: string, factor: number): UnitDefinition => ({
  name,
  symbol,
  factor,
});

const LIBRARY_ALIASES: Readonly<Record<string, LibraryUnit>> = {
  "length:mm": "mm",
  "length:cm": "cm",
  "length:m": "m",
  "length:km": "km",
  "length:µm": "µm",
  "length:nm": "nm",
  "length:in": "in",
  "length:ft": "ft",
  "length:yd": "yd",
  "length:mi": "mi",
  "length:nmi": "nautical miles",
  "mass:µg": "µg",
  "mass:mg": "mg",
  "mass:g": "g",
  "mass:kg": "kg",
  "mass:t": "metric tons",
  "mass:oz": "oz",
  "mass:lb": "lb",
  "mass:st": "st",
  "area:mm²": "mm²",
  "area:cm²": "cm²",
  "area:m²": "m²",
  "area:ha": "ha",
  "area:km²": "km²",
  "area:in²": "in²",
  "area:ft²": "ft²",
  "area:ac": "ac",
  "area:mi²": "mi²",
  "volume:mL": "mL",
  "volume:L": "L",
  "volume:cm³": "cm³",
  "volume:m³": "m³",
  "volume:tsp US": "US teaspoon",
  "volume:tbsp US": "US tablespoon",
  "volume:fl oz US": "US fluid ounce",
  "volume:cup US": "cup",
  "volume:gal US": "US liquid gallon",
  "volume:gal imp": "imperial gallon",
  "volume:ft³": "cubic foot",
  "pressure:Pa": "Pa",
  "pressure:kPa": "kPa",
  "pressure:MPa": "MPa",
  "pressure:bar": "bar",
  "pressure:atm": "atm",
  "pressure:psi": "psi",
  "energy:J": "J",
  "energy:kJ": "kJ",
  "energy:Wh": "Wh",
  "energy:kWh": "kWh",
  "power:W": "W",
  "power:kW": "kW",
  "power:MW": "MW",
  "power:hp": "hp",
  "force:N": "N",
  "force:kN": "kN",
  "force:lbf": "lbf",
  "frequency:Hz": "Hz",
  "frequency:kHz": "kHz",
  "frequency:MHz": "MHz",
  "frequency:GHz": "GHz",
  "data:bit": "bit",
  "data:B": "B",
  "data:KB": "KB",
  "data:MB": "MB",
  "data:GB": "GB",
  "data:TB": "TB",
  "data:KiB": "KiB",
  "data:MiB": "MiB",
  "data:GiB": "GiB",
  "data:TiB": "TiB",
  "angle:°": "°",
  "angle:rad": "rad",
  "angle:gon": "gon",
  "angle:′": "arcminute",
  "angle:″": "arcsecond",
  "illuminance:lx": "lx",
  "illuminance:fc": "foot-candle",
};

function category(
  id: string,
  name: string,
  icon: string,
  definitions: UnitDefinition[],
  options: Pick<Category, "temperature" | "assumption"> = {},
): Category {
  return {
    id,
    name,
    icon,
    ...options,
    units: definitions.map((definition) => ({
      ...definition,
      categoryId: id,
      ...(LIBRARY_ALIASES[`${id}:${definition.symbol}`]
        ? { libraryUnit: LIBRARY_ALIASES[`${id}:${definition.symbol}`] }
        : {}),
    })),
  };
}

export const categories: Category[] = [
  category("length", "Length", "↔", [
    u("Millimeter", "mm", 0.001),
    u("Centimeter", "cm", 0.01),
    u("Meter", "m", 1),
    u("Kilometer", "km", 1000),
    u("Micrometer", "µm", 0.000001),
    u("Nanometer", "nm", 0.000000001),
    u("Inch", "in", 0.0254),
    u("Foot", "ft", 0.3048),
    u("Yard", "yd", 0.9144),
    u("Mile", "mi", 1609.344),
    u("Nautical mile", "nmi", 1852),
  ]),
  category("mass", "Mass", "◌", [
    u("Microgram", "µg", 0.000000001),
    u("Milligram", "mg", 0.000001),
    u("Gram", "g", 0.001),
    u("Kilogram", "kg", 1),
    u("Metric tonne", "t", 1000),
    u("Ounce", "oz", 0.028349523125),
    u("Pound", "lb", 0.45359237),
    u("Stone", "st", 6.35029318),
  ]),
  category(
    "temperature",
    "Temperature",
    "°",
    [u("Celsius", "°C", 1), u("Fahrenheit", "°F", 1), u("Kelvin", "K", 1)],
    {
      temperature: true,
      assumption: "These are absolute temperatures; temperature differences use a multiplier without an offset.",
    },
  ),
  category("area", "Area", "▦", [
    u("Square millimeter", "mm²", 0.000001),
    u("Square centimeter", "cm²", 0.0001),
    u("Square meter", "m²", 1),
    u("Hectare", "ha", 10_000),
    u("Square kilometer", "km²", 1_000_000),
    u("Square inch", "in²", 0.00064516),
    u("Square foot", "ft²", 0.09290304),
    u("Acre", "ac", 4046.8564224),
    u("Square mile", "mi²", 2_589_988.110336),
  ]),
  category("volume", "Volume", "◉", [
    u("Milliliter", "mL", 0.001),
    u("Liter", "L", 1),
    u("Cubic centimeter", "cm³", 0.001),
    u("Cubic meter", "m³", 1000),
    u("US teaspoon", "tsp US", 0.00492892159375),
    u("US tablespoon", "tbsp US", 0.01478676478125),
    u("US fluid ounce", "fl oz US", 0.0295735295625),
    u("US cup", "cup US", 0.2365882365),
    u("US gallon", "gal US", 3.785411784),
    u("Imperial gallon", "gal imp", 4.54609),
    u("Cubic foot", "ft³", 28.316846592),
  ]),
  category("speed", "Speed", "➤", [
    u("Meter per second", "m/s", 1),
    u("Kilometer per hour", "km/h", 1 / 3.6),
    u("Mile per hour", "mph", 0.44704),
    u("Foot per second", "ft/s", 0.3048),
    u("Knot", "kn", 0.5144444444444445),
  ]),
  category(
    "time",
    "Time",
    "◷",
    [
      u("Millisecond", "ms", 0.001),
      u("Second", "s", 1),
      u("Minute", "min", 60),
      u("Hour", "h", 3600),
      u("Day", "d", 86_400),
      u("Week", "wk", 604_800),
      u("Month (30 days)", "mo", 2_592_000),
      u("Year (365.25 days)", "yr", 31_557_600),
    ],
    { assumption: "For consistent arithmetic, a month is 30 days and a year is 365.25 days." },
  ),
  category("pressure", "Pressure", "⌁", [
    u("Pascal", "Pa", 1),
    u("Kilopascal", "kPa", 1000),
    u("Megapascal", "MPa", 1_000_000),
    u("Bar", "bar", 100_000),
    u("Atmosphere", "atm", 101_325),
    u("Pound per square inch", "psi", 6894.757293168),
    u("Millimeter of mercury", "mmHg", 133.322387415),
  ]),
  category("energy", "Energy", "ϟ", [
    u("Joule", "J", 1),
    u("Kilojoule", "kJ", 1000),
    u("Calorie (thermochemical)", "cal", 4.184),
    u("Kilocalorie", "kcal", 4184),
    u("Watt-hour", "Wh", 3600),
    u("Kilowatt-hour", "kWh", 3_600_000),
    u("Electronvolt", "eV", 1.602176634e-19),
    u("British thermal unit (IT)", "BTU", 1055.05585262),
  ]),
  category("power", "Power", "ϟ", [
    u("Watt", "W", 1),
    u("Kilowatt", "kW", 1000),
    u("Megawatt", "MW", 1_000_000),
    u("Mechanical horsepower", "hp", 745.6998715822702),
  ]),
  category("force", "Force", "↗", [
    u("Newton", "N", 1),
    u("Kilonewton", "kN", 1000),
    u("Pound-force", "lbf", 4.4482216152605),
  ]),
  category("frequency", "Frequency", "〰", [
    u("Hertz", "Hz", 1),
    u("Kilohertz", "kHz", 1000),
    u("Megahertz", "MHz", 1_000_000),
    u("Gigahertz", "GHz", 1_000_000_000),
  ]),
  category("data", "Data storage", "▤", [
    u("Bit", "bit", 0.125),
    u("Byte", "B", 1),
    u("Kilobyte (SI)", "KB", 1000),
    u("Megabyte (SI)", "MB", 1_000_000),
    u("Gigabyte (SI)", "GB", 1_000_000_000),
    u("Terabyte (SI)", "TB", 1_000_000_000_000),
    u("Kibibyte (IEC)", "KiB", 1024),
    u("Mebibyte (IEC)", "MiB", 1_048_576),
    u("Gibibyte (IEC)", "GiB", 1_073_741_824),
    u("Tebibyte (IEC)", "TiB", 1_099_511_627_776),
  ]),
  category("data-rate", "Data transfer rate", "⇄", [
    u("Bit per second", "bit/s", 0.125),
    u("Kilobit per second (SI)", "kbit/s", 125),
    u("Megabit per second (SI)", "Mbit/s", 125_000),
    u("Gigabit per second (SI)", "Gbit/s", 125_000_000),
    u("Byte per second", "B/s", 1),
    u("Megabyte per second (SI)", "MB/s", 1_000_000),
  ]),
  category("angle", "Angle", "∠", [
    u("Degree", "°", 1),
    u("Radian", "rad", 180 / Math.PI),
    u("Gradian", "gon", 0.9),
    u("Arcminute", "′", 1 / 60),
    u("Arcsecond", "″", 1 / 3600),
  ]),
  category("density", "Density", "▥", [
    u("Kilogram per cubic meter", "kg/m³", 1),
    u("Gram per cubic centimeter", "g/cm³", 1000),
    u("Gram per milliliter", "g/mL", 1000),
    u("Pound per cubic foot", "lb/ft³", 16.01846337396),
  ]),
  category("torque", "Torque", "⤾", [
    u("Newton-meter", "N·m", 1),
    u("Pound-foot", "lb·ft", 1.3558179483314),
    u("Pound-inch", "lb·in", 0.1129848290276),
  ]),
  category("fuel", "Fuel economy", "↗", [
    u("Kilometer per liter", "km/L", 1),
    u("Liter per 100 kilometers", "L/100 km", 1),
    u("Mile per US gallon", "mpg US", 1.609344 / 3.785411784),
    u("Mile per imperial gallon", "mpg imp", 1.609344 / 4.54609),
  ]),
  category("current", "Electric current", "⏚", [
    u("Ampere", "A", 1),
    u("Milliampere", "mA", 0.001),
    u("Microampere", "µA", 0.000001),
  ]),
  category("voltage", "Voltage", "ϟ", [
    u("Volt", "V", 1),
    u("Millivolt", "mV", 0.001),
    u("Kilovolt", "kV", 1000),
  ]),
  category("resistance", "Electrical resistance", "Ω", [
    u("Ohm", "Ω", 1),
    u("Kilohm", "kΩ", 1000),
    u("Megohm", "MΩ", 1_000_000),
  ]),
  category("illuminance", "Illuminance", "✳", [
    u("Lux", "lx", 1),
    u("Foot-candle", "fc", 10.76391041671),
  ]),
];

export function convert(
  selectedCategory: Category,
  value: number,
  from: Unit,
  to: Unit,
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Conversion input must be a finite number.");
  }
  if (
    from.categoryId !== selectedCategory.id ||
    to.categoryId !== selectedCategory.id
  ) {
    throw new RangeError("Cannot convert between incompatible unit categories.");
  }

  if (selectedCategory.temperature) {
    const celsius =
      from.symbol === "°F"
        ? ((value - 32) * 5) / 9
        : from.symbol === "K"
          ? value - 273.15
          : value;
    if (celsius < -273.15 - 1e-12) {
      throw new RangeError("Temperature cannot be below absolute zero.");
    }
    return to.symbol === "°F"
      ? (celsius * 9) / 5 + 32
      : to.symbol === "K"
        ? celsius + 273.15
        : celsius;
  }

  if (selectedCategory.id === "fuel") {
    const kmPerLiter =
      from.symbol === "L/100 km" ? (value === 0 ? NaN : 100 / value) : value * from.factor;
    if (to.symbol === "L/100 km") {
      return kmPerLiter === 0 ? NaN : 100 / kmPerLiter;
    }
    return kmPerLiter / to.factor;
  }

  if (from.libraryUnit && to.libraryUnit) {
    return unitConvert(value, from.libraryUnit).to(to.libraryUnit);
  }

  return (value * from.factor) / to.factor;
}

export function getUnit(category: Category, symbol: string): Unit | undefined {
  return category.units.find((item) => item.symbol === symbol);
}
