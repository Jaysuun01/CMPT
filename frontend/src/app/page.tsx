// The price tracker page (/). Data is fetched on the server, so the browser never calls the API for it.
import { Tracker } from "@/components/Tracker";
import { getDataset } from "@/lib/api";
import { Calendar } from "@/lib/months";

/** Server-rendered price page: loads the dataset (or explains why it couldn't) and the range from the URL. */
export default async function Page({ searchParams }: PageProps<"/">) {
  const dataset = await getDataset();
  if (!dataset) {
    return (
      <main className="wrap unavailable">
        <h1>Construction material prices</h1>
        <p>The price data could not be loaded. Check that the data service is running (npm run dev starts both), then reload.</p>
      </main>
    );
  }
  const calendar = new Calendar(dataset.start, dataset.series[0]!.values.length);
  const initial = calendar.rangeFromParams(await searchParams);
  return <Tracker dataset={dataset} initial={initial} />;
}
