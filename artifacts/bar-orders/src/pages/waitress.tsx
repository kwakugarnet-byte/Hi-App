import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Send } from "lucide-react";
import {
  useGetMenuItems,
  useCreateOrderBatch,
  getGetMenuItemsQueryKey,
  getGetOrderBatchesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const orderItemSchema = z.object({
  menuItemId: z.number().min(1, "Please select an item"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
});

const orderFormSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

export default function Waitress() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const waitressName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Staff";

  const { data: menuItems, isLoading: menuLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() }
  });

  const createOrder = useCreateOrderBatch();

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerName: "",
      items: [{ menuItemId: 0, quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  function onSubmit(data: OrderFormValues) {
    createOrder.mutate({
      data: {
        waitressName,
        customerName: data.customerName,
        items: data.items,
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Order Sent",
          description: `Order for ${data.customerName} sent to the bar.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
        form.reset({
          customerName: "",
          items: [{ menuItemId: 0, quantity: 1 }],
        });
      },
      onError: () => {
        toast({
          title: "Failed to send order",
          description: "An error occurred. Please try again.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24">
      <header className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">New Order</h1>
          <p className="text-xs text-muted-foreground">{waitressName}</p>
        </div>
        <div className="w-10" />
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Customer Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="E.g. Table 4 / John"
                          className="h-12 text-lg bg-background border-border focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h2 className="text-lg font-bold uppercase tracking-wide">Items</h2>

              {menuLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full bg-card" />
                  <Skeleton className="h-16 w-full bg-card" />
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <Card key={field.id} className="border-border bg-card">
                      <CardContent className="p-4 flex gap-3 items-center">
                        <FormField
                          control={form.control}
                          name={`items.${index}.menuItemId`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <Select
                                value={field.value ? field.value.toString() : ""}
                                onValueChange={(val) => field.onChange(parseInt(val, 10))}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-12 text-base bg-background border-border focus:ring-primary">
                                    <SelectValue placeholder="Select Drink" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {menuItems?.map((item) => (
                                    <SelectItem key={item.id} value={item.id.toString()}>
                                      {item.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-12 text-center text-lg bg-background border-border focus-visible:ring-primary"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="h-12 w-12 shrink-0"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-dashed border-2 border-border text-muted-foreground hover:text-primary hover:border-primary bg-transparent"
                onClick={() => append({ menuItemId: 0, quantity: 1 })}
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Another Item
              </Button>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-10">
              <div className="max-w-2xl mx-auto">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-16 text-xl font-bold uppercase tracking-wider gap-3"
                  disabled={createOrder.isPending}
                >
                  <Send className="w-6 h-6" />
                  {createOrder.isPending ? "Sending..." : "Send to Bar"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
