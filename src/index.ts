import axios from 'axios';
import { Hono } from 'hono'
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';


type Bindings = {
  API_TOKEN: string
}

type City = {
  name: string,
  lat: number,
  lon: number,
  country: string,
  state: string,
  weather: string,
  temp_min: number,
  temp_max: number
}
const citySchema = z.object({
  city_name: z.string().refine(value => {
    return /^[A-Za-z]+$/.test(value);
  }, {
    message: 'city_name must only contain alphabetic characters',
  }),
});


function kelvinToCelsius(kelvin: number): number {
  return parseFloat((kelvin - 273.15).toFixed(2));
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(
  '/city/*',
  cors({
    origin: ['http://localhost:3000',],
  })
)

async function weatherCheck(cityInfo: City, token: Bindings["API_TOKEN"]) {
  // get weather info with geo lat and lon
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${cityInfo.lat}&lon=${cityInfo.lon}&appid=${token}`;
  try {
    const response = (await axios.get(url)).data;
    let temp_max = response["main"]["temp_max"];
    let temp_min = response["main"]["temp_min"];
    let weather = response["weather"].map((e: any) => e["main"]).join(",");
    cityInfo.temp_max = kelvinToCelsius(temp_max);
    cityInfo.temp_min = kelvinToCelsius(temp_min);
    cityInfo.weather = weather;
    console.log(response);
  } catch (error) {
    console.log(error);
    throw new HTTPException(400, { message: `Get the weather info of (${cityInfo.name}) failed` })
  }
}

app.get('/', (c) => {
  return c.text('Guten Tag! Mein Name ist Lixun.');
});

app.notFound((c) => {
  return c.json({ error: '404 Not Found' }, 404);
});

app.get('/city/:city_name',
  async (c) => {
    const { city_name } = c.req.param();
    const parsed = citySchema.safeParse({ city_name });

    if (!parsed.success) {
      console.error(parsed.error);
      return c.json({error: `Invalid city name => ${parsed.error}`}, 400);
    }
    // to get geo info of target city, may return many items
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${city_name}&limit=10&appid=${c.env.API_TOKEN}`;
    try {
      const response = (await axios.get(url)).data;
      if (response.message == "Nothing to geocode") {
        return c.json({ error: `Invalid city name (${city_name})` }, 400);
      }
      if (response.length == 0) {
        return c.json({ error: `Can not find the city name of (${city_name})` }, 400);
      }
      const cities_list = response.map((e: City) => {
        return { name: e["name"], lat: e["lat"], lon: e["lon"], country: e["country"], state: e["state"] }
      })
      for (let item of cities_list) {
        console.log(await weatherCheck(item, c.env.API_TOKEN));
      }

      return c.json(cities_list);
    } catch (error) {
      console.log(error);
      return c.json({ error: `Failed to fetch data => ${error}` }, 500);
    }
  });

export default app
